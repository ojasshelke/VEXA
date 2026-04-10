/**
 * apiKeyMiddleware.ts
 * Validates x-vexa-key header and attaches marketplace context to request.
 * Used by all /api/* routes that serve marketplace clients.
 *
 * RULE: no raw API keys in logs, no `any` types.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { MarketplaceContext } from '@/types';

// ─── In-memory key store (replace with DB lookup in production) ───────────────
// Production: query your database/KV store with the hashed key.
const MOCK_API_KEYS: Record<string, MarketplaceContext> = {
  'vx_live_myntra_demo_key_001': {
    marketplaceId: 'mkt_myntra',
    name: 'Myntra',
    apiKey: 'vx_live_myntra_demo_key_001',
    webhookUrl: 'https://api.myntra.com/vexa/webhook',
    createdAt: '2025-01-01T00:00:00Z',
  },
  'vx_live_ajio_demo_key_002': {
    marketplaceId: 'mkt_ajio',
    name: 'AJIO',
    apiKey: 'vx_live_ajio_demo_key_002',
    webhookUrl: 'https://api.ajio.com/vexa/webhook',
    createdAt: '2025-01-15T00:00:00Z',
  },
  'vx_dev_test_key_local': {
    marketplaceId: 'mkt_dev',
    name: 'Local Dev',
    apiKey: 'vx_dev_test_key_local',
    createdAt: '2025-01-01T00:00:00Z',
  },
};

export const VEXA_KEY_HEADER = 'x-vexa-key';
export const MARKETPLACE_CTX_HEADER = 'x-vexa-marketplace-id';

/**
 * Validate the x-vexa-key header and return MarketplaceContext or null.
 * Never logs the key value.
 */
export async function validateApiKey(
  req: NextRequest
): Promise<MarketplaceContext | null> {
  const key = req.headers.get(VEXA_KEY_HEADER);
  if (!key) return null;

  // Production: hash key → query DB
  // const hashedKey = await hashApiKey(key);
  // const record = await db.apiKeys.findUnique({ where: { hashedKey } });
  // return record ? { ...record } : null;

  return MOCK_API_KEYS[key] ?? null;
}

/**
 * Higher-order function for protecting route handlers.
 * Wrap any route handler: export const GET = withApiKey(handler);
 */
export function withApiKey(
  handler: (
    req: NextRequest,
    ctx: MarketplaceContext,
    params?: Record<string, string>
  ) => Promise<NextResponse>
) {
  return async (
    req: NextRequest,
    routeContext?: { params?: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    const ctx = await validateApiKey(req);

    if (!ctx) {
      return NextResponse.json(
        { error: 'Unauthorized — invalid or missing x-vexa-key' },
        { status: 401 }
      );
    }

    const params = routeContext?.params ? await routeContext.params : undefined;
    return handler(req, ctx, params);
  };
}

/**
 * Standalone middleware check — returns 401 response or null (authorized).
 * Use in route handlers that prefer inline checks.
 */
export async function requireApiKey(
  req: NextRequest
): Promise<{ ctx: MarketplaceContext; error: null } | { ctx: null; error: NextResponse }> {
  const ctx = await validateApiKey(req);
  if (!ctx) {
    return {
      ctx: null,
      error: NextResponse.json(
        { error: 'Unauthorized — invalid or missing x-vexa-key' },
        { status: 401 }
      ),
    };
  }
  return { ctx, error: null };
}
