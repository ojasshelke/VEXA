/**
 * POST /api/tryon
 * Core try-on engine. Calls the local CatVTON service at localhost:8002.
 * No HuggingFace. No external AI fallbacks. No placeholders.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isRateLimited } from '@/lib/rateLimit';
import { validateApiKey } from '@/lib/apiKeyMiddleware';
import { getFitRecommendation, getFitScore } from '@/lib/fitEngine';
import type { MarketplaceContext } from '@/types';
import type { ClothingAssetRow, Database } from '@/types/database';
import { uploadToR2 } from '@/lib/r2';

// ─── Next.js route config ─────────────────────────────────────────────────────
// CatVTON-MaskFree inference on M4 Pro MPS runs ~110 s at 50 steps. Force
// the Node.js runtime (not edge) and a 15-minute max duration so Next.js
// doesn't kill the handler. Also disable all response caching.
export const runtime = 'nodejs';
export const maxDuration = 900; // 15 minutes
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATVTON_URL = 'http://localhost:8002/tryon';
// Timeout is deliberately large. Local CatVTON-MaskFree on M4 Pro MPS runs
// 50 steps at ~2.2 s/step ≈ 110 s, and we want headroom for warm-up, image
// downloads and the rare MPS recompile. Effectively unbounded for local dev.
const CATVTON_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const CATVTON_RETRY_COUNT = 2;
const CATVTON_RETRY_DELAY_MS = 2_500;

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

  // In dev (no allowlist configured) let everything through
  if (!ALLOWED_STORAGE_ORIGIN) return url;

  const allowedOrigins = [
    ALLOWED_STORAGE_ORIGIN,
    'https://images.unsplash.com',
    'https://cdn.shopify.com',
  ];
  const isAllowed =
    allowedOrigins.some((o) => parsed.origin === o) ||
    parsed.origin.endsWith('.supabase.co') ||
    // R2 CDN domains (pub-*.r2.dev or custom domains via env)
    parsed.origin.endsWith('.r2.dev') ||
    (process.env.R2_PUBLIC_URL ? parsed.origin === new URL(process.env.R2_PUBLIC_URL).origin : false);

  if (!isAllowed) {
    throw new Error(`${description} origin not allowed: ${parsed.origin}`);
  }
  return url;
}


// ─── Supabase helper ──────────────────────────────────────────────────────────

function getServiceSupabase(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
      .single() as { data: { marketplace_id: string | null } | null };

    if (!userRecord) {
      // Auto-provision guest user for the dev marketplace so local testing works.
      if (marketplaceCtx.marketplaceId === 'mkt_dev') {
        await (supabase.from('users') as ReturnType<typeof supabase.from>).upsert({ id: bodyUserId, email: `${bodyUserId}@vexa.guest` });
        return { userId: bodyUserId, marketplace: marketplaceCtx };
      }
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

  // Dev-only guest fallback: allow unauthenticated requests when running locally.
  // NEVER matches in production (NODE_ENV === 'production').
  if (process.env.NODE_ENV !== 'production') {
    const guestId = bodyUserId || 'demo_user_001';
    const supabase = getServiceSupabase();
    await (supabase.from('users') as ReturnType<typeof supabase.from>).upsert({ id: guestId, email: `${guestId}@vexa.guest` });
    console.warn('[/api/tryon] Dev guest mode — bypassing auth for userId=%s', guestId);
    return {
      userId: guestId,
      marketplace: {
        marketplaceId: 'mkt_dev',
        name: 'Local Dev Guest',
        apiKey: 'dev-guest',
        createdAt: new Date().toISOString(),
      },
    };
  }

  return NextResponse.json({ error: 'Unauthorized: Valid Bearer token or API key required' }, { status: 401 });
}

// ─── Upload data: / blob: URI to R2, return a public HTTP URL ─────────────────
/**
 * CatVTON requires real HTTP(S) URLs — it cannot accept base64 data: URIs.
 * When the frontend sends a camera capture (data:image/...) we upload it to R2
 * first so CatVTON can download it.
 *
 * Falls back to a Supabase signed URL if R2 is not configured.
 */
async function resolveToPublicUrl(
  url: string,
  label: string,
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<string> {
  // Already a real HTTP URL — nothing to do
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  // data: or blob: — upload to R2/Supabase and return a public URL
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    const [meta, b64] = url.split(',');
    if (!b64) throw new Error(`${label}: invalid data URI`);
    const mime = meta?.slice(5).split(';')[0] || 'image/png';
    const ext = mime.split('/')[1] || 'png';
    const buffer = Buffer.from(b64, 'base64');
    const filename = `uploads/${userId}_${label}_${Date.now()}.${ext}`;

    // Try R2 first
    const r2Url = await uploadToR2(buffer, filename, mime);
    if (r2Url) {
      console.log(`[/api/tryon] ${label} data URI uploaded to R2 → ${r2Url.slice(0, 60)}…`);
      return r2Url;
    }

    // Fallback: Supabase Storage signed URL
    const { error } = await supabase.storage.from('avatars').upload(filename, buffer, { contentType: mime, upsert: true });
    if (!error) {
      const { data: signed } = await supabase.storage.from('avatars').createSignedUrl(filename, 3600);
      if (signed?.signedUrl) {
        console.log(`[/api/tryon] ${label} data URI uploaded to Supabase Storage`);
        return signed.signedUrl;
      }
    }

    throw new Error(
      `${label}: could not upload data URI to any public storage. ` +
      'Configure R2_ACCOUNT_ID / R2_BUCKET_NAME or Supabase Storage.',
    );
  }

  throw new Error(`${label}: unsupported URL scheme — expected http(s):// or data:`);
}



/** Map VEXA product category to CatVTON category for the /tryon API. */
function catVtonCategoryFromProductCategory(category: string | null | undefined): string {
  const c = (category ?? 'tops').toLowerCase();
  if (c === 'dresses') return 'dresses';
  if (c === 'bottoms' || c === 'shoes') return 'lower_body';
  return 'upper_body';
}

// ─── CatVTON local service call ───────────────────────────────────────────────

interface CatVTONResponse {
  result_image: string; // base64-encoded JPEG (changed from PNG for 4-6× smaller payload)
}

/**
 * Call the local CatVTON server with automatic retries.
 * Returns the raw base64 PNG string on success.
 * Throws on all-retries-exhausted or non-200.
 */
async function callCatVTON(
  personImageUrl: string,
  garmentImageUrl: string,
  category: string,
): Promise<string> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= CATVTON_RETRY_COUNT; attempt++) {
    try {
      console.log('[/api/tryon] CatVTON call attempt %d → %s', attempt, CATVTON_URL);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CATVTON_TIMEOUT_MS);

      const response = await fetch(CATVTON_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_image_url: personImageUrl,
          garment_image_url: garmentImageUrl,
          category,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`CatVTON returned ${response.status}: ${body.slice(0, 300)}`);
      }

      const data = (await response.json()) as CatVTONResponse;
      if (!data.result_image) {
        throw new Error('CatVTON returned empty result_image');
      }

      return data.result_image;
    } catch (err) {
      lastError = (err as Error).message;
      console.warn('[/api/tryon] Attempt %d failed: %s', attempt, lastError);
      if (attempt < CATVTON_RETRY_COUNT) {
        await new Promise((r) => setTimeout(r, CATVTON_RETRY_DELAY_MS));
      }
    }
  }

  throw new Error(`CatVTON service failed after ${CATVTON_RETRY_COUNT} attempts: ${lastError}`);
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
    // http(s):// URLs and data: URLs are usable as-is; anything else is a storage path.
    if (!finalUrl.startsWith('http') && !finalUrl.startsWith('data:')) {
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

  // 2. Resolve garment category from DB
  if (!userPhotoUrl || !productImageUrl) {
    throw new Error('Both userPhotoUrl and productImageUrl are required for try-on');
  }

  const { data: clothingRows } = await supabase
    .from('clothing_assets')
    .select('category')
    .eq('product_id', productId)
    .limit(1);
  const clothingCategory =
    (clothingRows as Pick<ClothingAssetRow, 'category'>[] | null)?.[0]?.category ?? null;
  const catVtonCategory = catVtonCategoryFromProductCategory(clothingCategory);

  // 3. Resolve both images to public HTTP URLs (uploads data: camera captures to R2)
  //    CatVTON requires real HTTP(S) URLs — Pydantic HttpUrl rejects data: URIs.
  const [resolvedPersonUrl, resolvedGarmentUrl] = await Promise.all([
    resolveToPublicUrl(userPhotoUrl, 'userPhotoUrl', userId, supabase),
    resolveToPublicUrl(productImageUrl, 'productImageUrl', userId, supabase),
  ]);

  // 4. Call local CatVTON service with real HTTP URLs
  const resultBase64 = await callCatVTON(resolvedPersonUrl, resolvedGarmentUrl, catVtonCategory);

  // 5. Upload result to R2 (CatVTON returns JPEG now — 4-6× smaller than PNG)
  const imageBuffer = Buffer.from(resultBase64, 'base64');
  const filename = `tryons/tryon_${userId}_${productId}_${Date.now()}.jpg`;
  const r2Url = await uploadToR2(imageBuffer, filename, 'image/jpeg');

  let resultUrl: string;
  if (r2Url) {
    resultUrl = r2Url;
    console.log('[/api/tryon] Result successfully stored in R2');
  } else {
    resultUrl = `data:image/jpeg;base64,${resultBase64}`;
    console.warn('[/api/tryon] R2 unavailable — serving base64 result inline');
  }
  const storagePath = resultUrl;

  // 6. Fit metadata
  let fitLabel = 'True to size';
  let recommendedSize = 'M';

  // Ensure user exists (Fix for FK violation if testing with guest accounts)
  await (supabase.from('users') as ReturnType<typeof supabase.from>).upsert({ id: userId, email: `${userId}@vexa.guest` }).select();

  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
  const { data: sizeChart } = await supabase.from('size_charts').select('*').eq('product_id', productId);

  if (user && sizeChart && Array.isArray(sizeChart) && sizeChart.length > 0) {
    const recommendation = getFitRecommendation(user, sizeChart);
    fitLabel = recommendation.fitLabel;
    recommendedSize = recommendation.recommendedSize;
  }

  // 6. Cache result
  console.log(`[/api/tryon] Caching result for user: ${userId}`);
  const { error: insertError } = await (supabase.from('tryon_results') as ReturnType<typeof supabase.from>).insert([
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

    // Surface CatVTON service failures as 503
    if (err.message.includes('CatVTON service failed') || err.message.includes('fetch failed')) {
      return NextResponse.json(
        { error: 'Try-on service unavailable. Please try again in a moment.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}