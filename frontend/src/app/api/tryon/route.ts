/**
 * POST /api/tryon
 * Core try-on engine. Accepts user photo + product image, returns AI-generated result.
 *
 * Auth:
 *  - Bearer token auth for direct user calls
 *  - API key auth for marketplace calls (x-vexa-key header)
 *  - IDOR fix: if API key request, verify userId belongs to that marketplace
 *
 * RULE: Never return unsigned Supabase URLs
 * RULE: Validate all incoming URLs at entry point
 * RULE: If createSignedUrl fails, throw — never return empty string
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isRateLimited } from '@/lib/rateLimit';
import { validateApiKey } from '@/lib/apiKeyMiddleware';
import { getFitRecommendation, getFitScore } from '@/lib/fitEngine';
import type { MarketplaceContext } from '@/types';
import type { Database, UserRow, TryOnResultRow } from '@/types/database';

// ─── SSRF Protection ──────────────────────────────────────────────────────────

const ALLOWED_STORAGE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin; } catch { return null; } })()
  : null;

function validateSecureUrl(url: string, description: string): string {
  if (!url) throw new Error(`${description} is required`);
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
    const isAllowed = allowedOrigins.some((o) => parsed.origin === o) || parsed.origin.endsWith('.supabase.co');
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
  // 1. Try API key auth (marketplace calls)
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
      .returns<Pick<UserRow, 'marketplace_id'>>()
      .single();

    if (!userRecord) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (userRecord.marketplace_id && userRecord.marketplace_id !== marketplaceCtx.marketplaceId) {
      return NextResponse.json({ error: 'Forbidden: User does not belong to this marketplace' }, { status: 403 });
    }

    return { userId: bodyUserId, marketplace: marketplaceCtx };
  }

  // 2. Bearer token auth for direct user calls
  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase environment variables missing');
    }
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Bearer token' }, { status: 401 });
    }
    // IDOR fix: session user can only act on their own behalf
    if (bodyUserId && bodyUserId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Cannot initiate try-on for another user' }, { status: 403 });
    }
    return { userId: user.id, marketplace: null };
  }

  return NextResponse.json({ error: 'Unauthorized: Valid Bearer token or API key required' }, { status: 401 });
}

// ─── Exported handleTryOn for direct import by [productId]/route.ts ───────────

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

/** Row shape from tryon_results select */
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

  // 1. Check cache
  const { data: cachedRecord } = await supabase
    .from('tryon_results')
    .select('result_url, fit_label, recommended_size')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .single();

  const cached = cachedRecord as CachedTryOnRow | null;

  if (cached?.result_url) {
    const { data: signedData, error: signError } = await supabase.storage
      .from('avatars')
      .createSignedUrl(cached.result_url, 3600);
    if (signError || !signedData?.signedUrl) {
      throw new Error(`Failed to sign cached result URL: ${signError?.message ?? 'unknown error'}`);
    }
    const fitLabel = cached.fit_label ?? 'True to size';
    return {
      resultUrl: signedData.signedUrl,
      storagePath: cached.result_url,
      cached: true,
      fitLabel: fitLabel,
      recommendedSize: cached.recommended_size ?? 'M',
      fitScore: getFitScore(fitLabel),
    };
  }

  // 2. Call Hugging Face API
  const hfKey = process.env.HUGGINGFACE_API_KEY;
  if (!hfKey) throw new Error('Missing HUGGINGFACE_API_KEY environment variable');

  const response = await fetch('https://api-inference.huggingface.co/models/yisol/IDM-VTON', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${hfKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: {
        human_img: userPhotoUrl ?? '',
        garm_img: productImageUrl ?? '',
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hugging Face API failed: ${response.status} - ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const fileName = `tryon_${userId}_${productId}_${Date.now()}.png`;
  const storagePath = `tryons/${fileName}`;

  // 3. Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(storagePath, arrayBuffer, { contentType: 'image/png', upsert: true });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  // 4. Create signed URL — throw on failure, never return empty string
  const { data: signedData, error: signError } = await supabase.storage
    .from('avatars')
    .createSignedUrl(storagePath, 3600);

  if (signError || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signError?.message ?? 'unknown error'}`);
  }

  // 5. Compute fit metadata
  let fitLabel = 'True to size';
  let recommendedSize = 'M';

  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
  const { data: sizeChart } = await supabase.from('size_charts').select('*').eq('product_id', productId);

  if (user && sizeChart && Array.isArray(sizeChart) && sizeChart.length > 0) {
    const recommendation = getFitRecommendation(user, sizeChart);
    fitLabel = recommendation.fitLabel;
    recommendedSize = recommendation.recommendedSize;
  }

  // 6. Store result — save storagePath for re-signing later, not the signed URL
  const insertData: Database['public']['Tables']['tryon_results']['Insert'] = {
    user_id: userId,
    product_id: productId,
    product_image_url: productImageUrl ?? '',
    result_url: storagePath,
    fit_label: fitLabel,
    recommended_size: recommendedSize,
  };

  const { error: insertError } = await supabase.from('tryon_results').insert(insertData);
  if (insertError) {
    // Non-fatal: result was generated successfully, log and continue
    console.warn('[/api/tryon] Failed to cache result:', insertError.message);
  }

  return {
    resultUrl: signedData.signedUrl,
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

    // Validate all incoming URLs at entry point — not mid-function
    const validatedPhotoUrl = userPhotoUrl ? validateSecureUrl(userPhotoUrl, 'userPhotoUrl') : undefined;
    const validatedProductUrl = productImageUrl ? validateSecureUrl(productImageUrl, 'productImageUrl') : undefined;

    // Authenticate
    const authResult = await authenticateRequest(req, userId ?? '');
    if (authResult instanceof NextResponse) return authResult;

    const authenticatedUserId = authResult.userId;
    const supabase = getServiceSupabase();

    const result = await handleTryOn(
      { userId: authenticatedUserId, productId, userPhotoUrl: validatedPhotoUrl, productImageUrl: validatedProductUrl },
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
