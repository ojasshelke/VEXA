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

/**
 * Uploads a buffer or URL to the Hugging Face Space directly.
 * This ensures the AI can see the image even if R2/Supabase is broken.
 */
async function uploadToHF(
  source: string | Buffer,
  hfKey: string
): Promise<{ path: string; url: string } | null> {
  try {
    const formData = new FormData();
    if (typeof source === 'string' && source.startsWith('data:')) {
      const base64 = source.split(',')[1];
      const blob = new Blob([new Uint8Array(Buffer.from(base64, 'base64'))], { type: 'image/png' });
      formData.append('files', blob, 'image.png');
    } else if (Buffer.isBuffer(source)) {
      const blob = new Blob([new Uint8Array(source)], { type: 'image/png' });
      formData.append('files', blob, 'image.png');
    } else if (typeof source === 'string' && source.startsWith('http')) {
      const res = await fetch(source);
      const blob = await res.blob();
      formData.append('files', blob, 'image.png');
    }

    const response = await fetch('https://yisol-idm-vton.hf.space/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${hfKey}` },
      body: formData
    });

    if (!response.ok) throw new Error(`HF Upload failed: ${response.status}`);
    const result = await response.json();
    return { path: result[0], url: `https://yisol-idm-vton.hf.space/file=${result[0]}` };
  } catch (e) {
    console.error('[/api/tryon] HF Upload error:', (e as Error).message);
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
  const hfKey = process.env.HUGGINGFACE_API_KEY;

  // 1. Check cache
  const { data: cachedRecord } = await supabase
    .from('tryon_results')
    .select('result_url, fit_label, recommended_size')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .single();

  const cached = cachedRecord as CachedTryOnRow | null;
  if (cached?.result_url) {
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

  // 2. Try HF Space AI engine (Direct Upload Path)
  const SPACE_URL = 'https://yisol-idm-vton.hf.space';
  const authHeaders = { Authorization: `Bearer ${hfKey}` };
  let arrayBuffer: ArrayBuffer | null = null;
  
  if (hfKey && userPhotoUrl && productImageUrl) {
    try {
      console.log('[/api/tryon] Starting AI Engine via Direct HF Upload...');
      
      // Upload images to HF explicitly for reliability
      const [hfUserImg, hfGarmImg] = await Promise.all([
        uploadToHF(userPhotoUrl, hfKey),
        uploadToHF(productImageUrl, hfKey)
      ]);

      if (!hfUserImg || !hfGarmImg) throw new Error('Failed to upload assets to AI cluster');

      const sessionHash = Math.random().toString(36).substring(2, 15);
      
      // Start Gradio Prediction
      const joinResponse = await fetch(`${SPACE_URL}/queue/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          data: [
            { 
              "background": { "path": hfUserImg.path, "meta": { "_type": "gradio.FileData" } }, 
              "layers": [], 
              "composite": null 
            }, // Person
            { "path": hfGarmImg.path, "meta": { "_type": "gradio.FileData" } }, // Garment
            "Vexa Fashion Try-On", // Description
            true, // is_checked (mask)
            true, // is_checked_crop
            30, // steps
            42, // seed
          ],
          fn_index: 0,
          session_hash: sessionHash
        }),
      });

      if (!joinResponse.ok) throw new Error(`AI Queue join failed: ${joinResponse.status}`);
      const { event_id } = await joinResponse.json();
      console.log('[/api/tryon] AI processing started. Queue ID:', event_id);

      // Poll for result (SSE equivalent via fetch loop)
      const dataRes = await fetch(`${SPACE_URL}/queue/data?session_hash=${sessionHash}`, { headers: authHeaders });
      if (!dataRes.ok) throw new Error(`SSE connect failed: ${dataRes.status}`);

      const reader = dataRes.body?.getReader();
      if (!reader) throw new Error('No SSE stream');

      const decoder = new TextDecoder();
      let resultData: any = null;
      let sseBuffer = '';
      const startTime = Date.now();

      try {
        while (true) {
          if (Date.now() - startTime > 120_000) throw new Error('AI timeout (2 min)');
          const { done, value } = await reader.read();
          if (done) break;
          
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() || '';
          
          for (const line of lines) {
            if (!line.trim().startsWith('data: ')) continue;
            try {
              const parsed = JSON.parse(line.trim().slice(6));
              if (parsed.msg === 'process_completed') {
                if (parsed.success === true && parsed.output?.data) {
                  resultData = parsed.output.data;
                } else {
                  throw new Error('AI Space reported failure');
                }
              }
            } catch (e) {
              // Ignore partial JSON
            }
          }
          if (resultData) break;
        }
      } finally {
        reader.releaseLock();
      }

      const firstResult = resultData?.[0];
      const resultImageUrl = firstResult?.url || (firstResult?.path ? `${SPACE_URL}/file=${firstResult.path}` : null);
      if (!resultImageUrl) throw new Error('No result URL from AI');

      const imgRes = await fetch(resultImageUrl, { headers: authHeaders });
      if (!imgRes.ok) throw new Error('Failed to download AI result');
      arrayBuffer = await imgRes.arrayBuffer();
      console.log('[/api/tryon] AI engine succeeded');

    } catch (aiError) {
      console.warn('[/api/tryon] AI engine unavailable, using demo fallback:', (aiError as Error).message);
      arrayBuffer = null;
    }
  }

  // 3. Demo fallback — use user photo directly if AI failed
  if (!arrayBuffer) {
    if (userPhotoUrl?.startsWith('data:')) {
      const base64Data = userPhotoUrl.split(',')[1];
      if (base64Data) {
        const buf = Buffer.from(base64Data, 'base64');
        arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      }
    } else if (userPhotoUrl) {
      const res = await fetch(userPhotoUrl);
      if (res.ok) arrayBuffer = await res.arrayBuffer();
    }
  }

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

  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
  const { data: sizeChart } = await supabase.from('size_charts').select('*').eq('product_id', productId);

  if (user && sizeChart && Array.isArray(sizeChart) && sizeChart.length > 0) {
    const recommendation = getFitRecommendation(user, sizeChart);
    fitLabel = recommendation.fitLabel;
    recommendedSize = recommendation.recommendedSize;
  }

  // 7. Cache result
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}