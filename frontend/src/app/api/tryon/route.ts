/**
 * POST /api/tryon
 * Core try-on engine. Accepts user photo + product image, returns AI-generated result.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isRateLimited } from '@/lib/rateLimit';
import { validateApiKey } from '@/lib/apiKeyMiddleware';
import { getFitRecommendation, getFitScore } from '@/lib/fitEngine';
import type { MarketplaceContext } from '@/types';
import type { Database, UserRow, TryOnResultRow } from '@/types/database';
import { uploadToR2 } from '@/lib/r2';
import { startFashnTryOn, pollFashnResult } from '@/lib/fashn';

// ─── SSRF Protection ──────────────────────────────────────────────────────────

const ALLOWED_STORAGE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin; } catch { return null; } })()
  : null;

function validateSecureUrl(url: string, description: string): string {
  if (!url) throw new Error(`${description} is required`);

  // data: and blob: URLs are local — no origin to validate, allow immediately
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${description} is not a valid URL`);
  }

  if (ALLOWED_STORAGE_ORIGIN) {
    const allowedOrigins = [
      ALLOWED_STORAGE_ORIGIN,
      'https://images.unsplash.com',
      'https://cdn.shopify.com',
    ];
    const isAllowed =
      allowedOrigins.some((o) => parsed.origin === o) ||
      parsed.origin.endsWith('.supabase.co');

    if (!isAllowed) {
      throw new Error(`${description} origin not allowed: ${parsed.origin}`);
    }
  }
  return url;
}

// ─── Supabase helper ──────────────────────────────────────────────────────────

function getServiceSupabase(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase environment variables missing');
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

interface AuthResult {
  userId: string;
  marketplace: MarketplaceContext | null;
}

async function authenticateRequest(req: NextRequest, bodyUserId: string): Promise<AuthResult | NextResponse> {
  const marketplaceCtx = await validateApiKey(req);
  if (marketplaceCtx) {
    if (!bodyUserId) {
      return NextResponse.json({ error: 'userId is required for marketplace requests' }, { status: 400 });
    }
    const supabase = getServiceSupabase();
    const { data: userRecord } = await supabase
      .from('users')
      .select('marketplace_id')
      .eq('id', bodyUserId)
      .single() as any;

    if (!userRecord) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (userRecord.marketplace_id && userRecord.marketplace_id !== marketplaceCtx.marketplaceId) {
      return NextResponse.json({ error: 'Forbidden: User does not belong to this marketplace' }, { status: 403 });
    }
    return { userId: bodyUserId, marketplace: marketplaceCtx };
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase environment variables missing');

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Bearer token' }, { status: 401 });
    }
    if (bodyUserId && bodyUserId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Cannot initiate try-on for another user' }, { status: 403 });
    }
    return { userId: user.id, marketplace: null };
  }

  return NextResponse.json({ error: 'Unauthorized: Valid Bearer token or API key required' }, { status: 401 });
}

// ─── Upload data URL to Supabase storage, return signed URL ──────────────────

async function uploadDataUrl(
  dataUrl: string,
  userId: string
): Promise<string | null> {
  // We first try R2 (as requested previously), but now we have a secondary 
  // path in handleTryOn that uploads to HF if this fails or is skipped.
  try {
    const base64Data = dataUrl.split(',')[1];
    if (!base64Data) return null;

    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `uploads/${userId}_${Date.now()}.png`;

    const publicUrl = await uploadToR2(buffer, filename, 'image/png');
    return publicUrl;
  } catch (e) {
    console.warn('[/api/tryon] Storage upload skipped/failed, will rely on direct HF upload');
    return null;
  }
}



// ─── handleTryOn ──────────────────────────────────────────────────────────────

interface HandleTryOnInput {
  userId: string;
  productId: string;
  userPhotoUrl?: string;
  productImageUrl?: string;
}

export interface HandleTryOnResult {
  resultUrl: string;
  storagePath: string;
  cached: boolean;
  fitLabel: string;
  recommendedSize: string;
  fitScore: number;
}

interface CachedTryOnRow {
  result_url: string;
  fit_label: string | null;
  recommended_size: string | null;
}

export async function handleTryOn(
  input: HandleTryOnInput,
  supabase: SupabaseClient<Database>
): Promise<HandleTryOnResult> {
  const { userId, productId, userPhotoUrl, productImageUrl } = input;
  const fashnKey = process.env.FASHN_API_KEY;

  // 1. Check cache
  const { data: cachedRecord } = await supabase
    .from('tryon_results')
    .select('result_url, fit_label, recommended_size')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .single();

  const cached = cachedRecord as CachedTryOnRow | null;
  if (cached?.result_url && cached.result_url !== 'base64_fallback') {
    let finalUrl = cached.result_url;
    if (!finalUrl.startsWith('http')) {
      const { data: signedData } = await supabase.storage.from('avatars').createSignedUrl(finalUrl, 3600);
      if (signedData?.signedUrl) finalUrl = signedData.signedUrl;
    }
    const fitLabel = cached.fit_label ?? 'True to size';
    return {
      resultUrl: finalUrl,
      storagePath: cached.result_url,
      cached: true,
      fitLabel,
      recommendedSize: cached.recommended_size ?? 'M',
      fitScore: getFitScore(fitLabel),
    };
  }

  // 2. Run Fashn.ai Try-On Engine
  if (!fashnKey) {
    throw new Error('Try-on service not configured');
  }

  let arrayBuffer: ArrayBuffer | null = null;
  
  if (!userPhotoUrl || !productImageUrl) {
    throw new Error('Missing user photo or product image');
  }

  console.log('[/api/tryon] Starting Fashn.ai Try-On Engine...');
  const predictionId = await startFashnTryOn(userPhotoUrl, productImageUrl, fashnKey);
  
  let fashnResultUrl: string | null = null;
  for (let i = 0; i < 45; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusUrl = await pollFashnResult(predictionId, fashnKey);
    if (statusUrl) {
      fashnResultUrl = statusUrl;
      break;
    }
  }

  if (!fashnResultUrl) {
    throw new Error('Try-on timed out, please try again');
  }

  console.log('[/api/tryon] Fashn.ai completed successfully.');
  const imgRes = await fetch(fashnResultUrl);
  if (!imgRes.ok) throw new Error('Failed to download Fashn result image');
  arrayBuffer = await imgRes.arrayBuffer();

  if (!arrayBuffer) throw new Error('No image data to store');

  // 4. Upload result to R2 (or fallback to base64 for demo)
  const filename = `tryons/tryon_${userId}_${productId}_${Date.now()}.png`;
  let resultUrl: string;
  let storagePath: string;

  try {
    resultUrl = await uploadToR2(Buffer.from(arrayBuffer), filename, 'image/png');
    storagePath = resultUrl;
    console.log('[/api/tryon] Result successfully stored in R2');
  } catch (e) {
    console.warn('[/api/tryon] Storage failed, falling back to base64 result:', (e as Error).message);
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    resultUrl = `data:image/png;base64,${base64}`;
    storagePath = 'base64_fallback'; // We store a placeholder in the DB
  }

  // 6. Fit metadata
  let fitLabel = 'True to size';
  let recommendedSize = 'M';

  // Ensure user exists (Fix for FK violation if testing with guest accounts)
  await (supabase.from('users') as any).upsert({ id: userId, email: `${userId}@vexa.guest` }).select();

  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
  const { data: sizeChart } = await supabase.from('size_charts').select('*').eq('product_id', productId);

  if (user && sizeChart && Array.isArray(sizeChart) && sizeChart.length > 0) {
    const recommendation = getFitRecommendation(user, sizeChart);
    fitLabel = recommendation.fitLabel;
    recommendedSize = recommendation.recommendedSize;
  }

  // 7. Cache result
  console.log(`[/api/tryon] Caching result for user: ${userId}`);
  const { error: insertError } = await (supabase.from('tryon_results') as any).insert([
    {
      user_id: userId,
      product_id: productId,
      product_image_url: productImageUrl ?? '',
      result_url: storagePath,
      fit_label: fitLabel,
      recommended_size: recommendedSize,
    }
  ]);

  if (insertError) {
    console.warn('[/api/tryon] Failed to cache result:', insertError.message);
  }

  return {
    resultUrl,
    storagePath,
    cached: false,
    fitLabel,
    recommendedSize,
    fitScore: getFitScore(fitLabel),
  };
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  if (await isRateLimited(ip, 10)) {
    return NextResponse.json({ error: 'Too many requests. Please wait 60 seconds.' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { userId, userPhotoUrl, productImageUrl, productId } = body as {
      userId?: string;
      userPhotoUrl?: string;
      productImageUrl?: string;
      productId?: string;
    };

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    // Validate URLs — data: and blob: pass through, external URLs are origin-checked
    const validatedPhotoUrl = userPhotoUrl ? validateSecureUrl(userPhotoUrl, 'userPhotoUrl') : undefined;
    const validatedProductUrl = productImageUrl ? validateSecureUrl(productImageUrl, 'productImageUrl') : undefined;

    const authResult = await authenticateRequest(req, userId ?? '');
    if (authResult instanceof NextResponse) return authResult;

    const supabase = getServiceSupabase();
    const result = await handleTryOn(
      { userId: authResult.userId, productId, userPhotoUrl: validatedPhotoUrl, productImageUrl: validatedProductUrl },
      supabase
    );

    return NextResponse.json({
      resultUrl: result.resultUrl,
      cached: result.cached,
      fitLabel: result.fitLabel,
      recommendedSize: result.recommendedSize,
      fitScore: result.fitScore,
    }, { status: 200 });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[/api/tryon] Error:', err.message);
    const status = err.message === 'Try-on service not configured' ? 503 : (err.message.includes('timed out') ? 504 : 500);
    return NextResponse.json({ error: err.message }, { status });
  }
}