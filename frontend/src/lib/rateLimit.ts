/**
 * rateLimit.ts
 *
 * Provides rate limiting for VEXA API routes.
 * 
 * SCALING RULE:
 * 1. If UPSTASH_REDIS_REST_URL is set, use distributed Redis (production-ready).
 * 2. Otherwise, fallback to in-memory Map (local development / single-instance).
 */

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// In-memory store for fallback/dev
const localStore = new Map<string, RateLimitRecord>();

/**
 * Distributed rate limit check using Upstash Redis REST API.
 */
async function checkRedisLimit(ip: string, limit: number, windowMs: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return false;

  try {
    const key = `ratelimit:${ip}`;
    // Simple INCR + EXPIRE logic via REST
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify([
        ['INCR', key],
        ['PEXPIRE', key, windowMs],
      ]),
    });

    if (!res.ok) return false;
    const data = await res.json();
    const count = data[0]?.result;
    
    return count > limit;
  } catch (err) {
    console.error('[RateLimit] Redis failure, falling back to local memory:', err);
    return false;
  }
}

/**
 * Returns true if the request should be BLOCKED, false if allowed.
 * Supports async check for Redis.
 */
export async function isRateLimited(
  ip: string,
  limit = 10,
  windowMs = 60_000
): Promise<boolean> {
  // Try Redis first if configured
  if (process.env.UPSTASH_REDIS_REST_URL) {
    const blocked = await checkRedisLimit(ip, limit, windowMs);
    if (blocked) return true;
    // Note: if Redis fails, we fall back to local memory below
  }

  // Fallback to in-memory store
  const now = Date.now();
  const record = localStore.get(ip);

  if (!record || now > record.resetTime) {
    localStore.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }

  record.count += 1;
  return record.count > limit;
}

// Low-frequency cleanup for local store
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of localStore.entries()) {
      if (now > record.resetTime) localStore.delete(key);
    }
  }, 10 * 60 * 1000);
}
