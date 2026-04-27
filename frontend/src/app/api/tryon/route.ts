/**
 * POST /api/tryon
 * Core try-on engine powered by LightX Virtual Try-On API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isRateLimited } from '@/lib/rateLimit';
import { validateApiKey } from '@/lib/apiKeyMiddleware';
import { getFitRecommendation, getFitScore } from '@/lib/fitEngine';
import type { MarketplaceContext, LightXTryOnResponse, LightXStatusResponse } from '@/types';
import type { ClothingAssetRow, Database } from '@/types/database';
import { uploadToR2 } from '@/lib/r2';

// ─── Next.js route config ─────────────────────────────────────────────────────
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// ─── LightX API constants ─────────────────────────────────────────────────────
const LIGHTX_TRYON_URL = 'https://api.lightxeditor.com/external/api/v2/aivirtualtryon';
const LIGHTX_STATUS_URL = 'https://api.lightxeditor.com/external/api/v1/order-status';
const LIGHTX_POLL_INTERVAL_MS = 3000;
const LIGHTX_MAX_POLLS = 20;
const LIGHTX_FETCH_TIMEOUT_MS = 30_000;

// ─── SSRF Protection ──────────────────────────────────────────────────────────

const ALLOWED_STORAGE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin; } catch { return null; } })()
  : null;

function validateSecureUrl(url: string, description: string): string {
  if (!url) throw new Error(`${description} is required`);

  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${description} is not a valid URL`);
  }

  if (!ALLOWED_STORAGE_ORIGIN) return url;

  const allowedOrigins = [
    ALLOWED_STORAGE_ORIGIN,
    'https://images.unsplash.com',
    'https://cdn.shopify.com',
  ];
  const isAllowed =
    allowedOrigins.some((o) => parsed.origin === o) ||
    parsed.origin.endsWith('.supabase.co') ||
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

// ─── Resolve data:/blob: URI to a public HTTP URL ─────────────────────────────

async function resolveToPublicUrl(
  url: string,
  label: string,
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<string> {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  if (url.startsWith('data:') || url.startsWith('blob:')) {
    const [meta, b64] = url.split(',');
    if (!b64) throw new Error(`${label}: invalid data URI`);
    const mime = meta?.slice(5).split(';')[0] || 'image/png';
    const ext = mime.split('/')[1] || 'png';
    const buffer = Buffer.from(b64, 'base64');
    const filename = `uploads/${userId}_${label}_${Date.now()}.${ext}`;

    const r2Url = await uploadToR2(buffer, filename, mime);
    if (r2Url) {
      console.log(`[LightX] ${label} data URI uploaded to R2 → ${r2Url.slice(0, 60)}…`);
      return r2Url;
    }

    const { error } = await supabase.storage.from('avatars').upload(filename, buffer, { contentType: mime, upsert: true });
    if (!error) {
      const { data: signed } = await supabase.storage.from('avatars').createSignedUrl(filename, 3600);
      if (signed?.signedUrl) {
        console.log(`[LightX] ${label} data URI uploaded to Supabase Storage`);
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

// ─── LightX API call + polling ────────────────────────────────────────────────

async function callLightX(personImageUrl: string, garmentImageUrl: string): Promise<string> {
  const apiKey = process.env.LIGHTX_API_KEY;
  if (!apiKey) {
    throw new Error('LIGHTX_API_KEY is not configured');
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  };

  // Step 1 — submit try-on job
  console.log('[LightX] Submitting try-on job…');
  const submitRes = await fetch(LIGHTX_TRYON_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ imageUrl: personImageUrl, styleImageUrl: garmentImageUrl }),
    signal: AbortSignal.timeout(LIGHTX_FETCH_TIMEOUT_MS),
  });

  if (!submitRes.ok) {
    const body = await submitRes.text().catch(() => '');
    throw new Error(`[LightX] Submit failed ${submitRes.status}: ${body.slice(0, 300)}`);
  }

  const submitRaw = (await submitRes.json()) as LightXTryOnResponse;
  console.log('[LightX] Submit raw response:', JSON.stringify(submitRaw).slice(0, 400));

  // v2 API may wrap payload in a `body` field
  const submitData = submitRaw.body ?? submitRaw;
  const orderId = submitData.orderId;
  if (!orderId) {
    throw new Error(`[LightX] Submit response missing orderId. Raw: ${JSON.stringify(submitRaw).slice(0, 300)}`);
  }
  console.log(`[LightX] Job created — orderId=${orderId}`);

  // Step 2 — poll for completion
  for (let poll = 1; poll <= LIGHTX_MAX_POLLS; poll++) {
    await new Promise<void>((resolve) => setTimeout(resolve, LIGHTX_POLL_INTERVAL_MS));

    const statusRes = await fetch(LIGHTX_STATUS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId }),
      signal: AbortSignal.timeout(LIGHTX_FETCH_TIMEOUT_MS),
    });

    if (!statusRes.ok) {
      const errBody = await statusRes.text().catch(() => '');
      throw new Error(`[LightX] Status poll failed ${statusRes.status}: ${errBody.slice(0, 300)}`);
    }

    const statusRaw = (await statusRes.json()) as LightXStatusResponse;
    const statusData = statusRaw.body ?? statusRaw;

    // Accept both `imageStatus` (v2) and `status` (v1) field names
    const currentStatus = statusData.imageStatus ?? statusData.status ?? '';
    // Accept both `outputImageUrl` (v2) and `output` (v1) field names
    const outputUrl = statusData.outputImageUrl ?? statusData.output;

    console.log(`[LightX] Poll ${poll}/${LIGHTX_MAX_POLLS}: status=${currentStatus}`);

    if (currentStatus === 'active') {
      if (!outputUrl) {
        throw new Error('[LightX] Status is active but output URL is missing');
      }
      console.log(`[LightX] Try-on complete: ${outputUrl}`);
      return outputUrl;
    }

    if (currentStatus === 'failed') {
      throw new Error(`[LightX] Job failed (orderId=${orderId})`);
    }
  }

  throw new Error(`[LightX] Timed out after ${LIGHTX_MAX_POLLS} polls (${(LIGHTX_MAX_POLLS * LIGHTX_POLL_INTERVAL_MS) / 1000}s)`);
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
    .not('result_url', 'is', null)
    .neq('result_url', '')
    .single();

  const cached = cachedRecord as CachedTryOnRow | null;
  if (cached?.result_url) {
    let finalUrl = cached.result_url;
    if (!finalUrl.startsWith('http') && !finalUrl.startsWith('data:')) {
      const { data: signedData } = await supabase.storage.from('avatars').createSignedUrl(finalUrl, 3600);
      if (signedData?.signedUrl) finalUrl = signedData.signedUrl;
    }
    const fitLabel = cached.fit_label ?? 'True to size';
    console.log('[LightX] Cache hit for', userId, productId);
    return {
      resultUrl: finalUrl,
      storagePath: cached.result_url,
      cached: true,
      fitLabel,
      recommendedSize: cached.recommended_size ?? 'M',
      fitScore: getFitScore(fitLabel),
    };
  }

  if (!userPhotoUrl || !productImageUrl) {
    throw new Error('Both userPhotoUrl and productImageUrl are required for try-on');
  }

  // 2. Resolve both images to public HTTP URLs (handles data: URIs)
  const [resolvedPersonUrl, resolvedGarmentUrl] = await Promise.all([
    resolveToPublicUrl(userPhotoUrl, 'userPhotoUrl', userId, supabase),
    resolveToPublicUrl(productImageUrl, 'productImageUrl', userId, supabase),
  ]);

  // 3. Call LightX Virtual Try-On API
  const lightxResultUrl = await callLightX(resolvedPersonUrl, resolvedGarmentUrl);

  // 4. Mirror result to R2 for persistence (LightX URLs may expire)
  let resultUrl = lightxResultUrl;
  let storagePath = lightxResultUrl;

  try {
    const imageRes = await fetch(lightxResultUrl, { signal: AbortSignal.timeout(LIGHTX_FETCH_TIMEOUT_MS) });
    if (imageRes.ok) {
      const arrayBuf = await imageRes.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuf);
      const contentType = imageRes.headers.get('content-type') ?? 'image/png';
      const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
      const filename = `tryons/tryon_${userId}_${productId}_${Date.now()}.${ext}`;
      const r2Url = await uploadToR2(imageBuffer, filename, contentType);
      if (r2Url) {
        resultUrl = r2Url;
        storagePath = r2Url;
        console.log('[LightX] Result mirrored to R2:', r2Url.slice(0, 80));
      }
    }
  } catch (mirrorErr) {
    console.warn('[LightX] R2 mirror failed (non-fatal):', (mirrorErr as Error).message);
  }

  // 5. Fit metadata
  let fitLabel = 'True to size';
  let recommendedSize = 'M';

  await (supabase.from('users') as ReturnType<typeof supabase.from>).upsert({ id: userId, email: `${userId}@vexa.guest` }).select();

  const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
  const { data: sizeChart } = await supabase.from('size_charts').select('*').eq('product_id', productId);

  if (user && sizeChart && Array.isArray(sizeChart) && sizeChart.length > 0) {
    const recommendation = getFitRecommendation(user, sizeChart);
    fitLabel = recommendation.fitLabel;
    recommendedSize = recommendation.recommendedSize;
  }

  // 6. Cache result
  console.log(`[LightX] Caching result for user: ${userId}`);
  const { error: upsertError } = await (supabase.from('tryon_results') as ReturnType<typeof supabase.from>).upsert(
    {
      user_id: userId,
      product_id: productId,
      product_image_url: productImageUrl ?? '',
      result_url: storagePath,
      fit_label: fitLabel,
      recommended_size: recommendedSize,
      status: 'ready',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,product_id' }
  );

  if (upsertError) {
    console.warn('[LightX] Failed to cache result:', upsertError.message);
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

    if (!userPhotoUrl || !productImageUrl) {
      return NextResponse.json({ error: 'userPhotoUrl and productImageUrl are required' }, { status: 400 });
    }

    const validatedPhotoUrl = validateSecureUrl(userPhotoUrl, 'userPhotoUrl');
    const validatedProductUrl = validateSecureUrl(productImageUrl, 'productImageUrl');

    const authResult = await authenticateRequest(req, userId ?? '');
    if (authResult instanceof NextResponse) return authResult;

    const supabase = getServiceSupabase();
    const result = await handleTryOn(
      {
        userId: authResult.userId,
        productId,
        userPhotoUrl: validatedPhotoUrl,
        productImageUrl: validatedProductUrl,
      },
      supabase
    );

    return NextResponse.json({
      result_url: result.resultUrl,
      resultUrl: result.resultUrl,
      cached: result.cached,
      status: 'ready',
      fitLabel: result.fitLabel,
      recommendedSize: result.recommendedSize,
      fitScore: result.fitScore,
    }, { status: 200 });

  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[LightX] Error:', error.message);

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
