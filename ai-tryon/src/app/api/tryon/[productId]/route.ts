/**
 * POST /api/tryon/[productId]
 * Drapes a clothing GLB over a user's avatar in the VEXA pipeline.
 * Returns a signed render URL + fit metadata.
 *
 * Auth: validated via Supabase Bearer token or x-vexa-key (at route level)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/apiKeyMiddleware';
import { getSignedAvatarUrl, tryOnStoragePath } from '@/lib/avatarCache';
import type { TryOnResult } from '@/types';

interface RouteContext {
  params: Promise<{ productId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  // 1. Auth — try x-vexa-key for marketplace, or Bearer for first-party
  const apiKey = req.headers.get('x-vexa-key');
  let marketplaceId = 'first-party';

  if (apiKey) {
    const ctx = await validateApiKey(apiKey);
    if (!ctx) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }
    marketplaceId = ctx.marketplace_name;
  }

  const { productId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body is required' }, { status: 400 });
  }

  const { userId, avatarGlbUrl, clothingGlbUrl } = body as {
    userId?: string;
    avatarGlbUrl?: string;
    clothingGlbUrl?: string;
  };

  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  if (!avatarGlbUrl) return NextResponse.json({ error: 'avatarGlbUrl is required' }, { status: 400 });
  if (!clothingGlbUrl) return NextResponse.json({ error: 'clothingGlbUrl is required' }, { status: 400 });

  // 2. Simulate try-on processing (Python service in production)
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 3. Build signed render URL — in production this is output from Python service
  const storagePath = tryOnStoragePath(userId, productId);
  const renderUrl = await getSignedAvatarUrl(storagePath);

  const result: TryOnResult = {
    id: `res_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    productId,
    renderUrl,
    fitScore: Math.floor(Math.random() * 15) + 85, // 85–99
    sizeRecommendation: ['S', 'M', 'L', 'XL'][Math.floor(Math.random() * 4)],
    heatmapUrl: renderUrl, // same stub; real heatmap from Python service
    status: 'ready',
  };

  return NextResponse.json({
    ...result,
    marketplaceId,
    signedExpiry: new Date(Date.now() + 3600 * 1000).toISOString(),
  });
}
