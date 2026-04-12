interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

/**
 * Simple in-memory rate limiter for production edge cases.
 * Returns true if the request is allowed, false if rate limited.
 */
export function isRateLimited(ip: string, limit: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  
  if (!store[ip]) {
    store[ip] = {
      count: 1,
      resetTime: now + windowMs,
    };
    return false;
  }

  const record = store[ip];

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    return false;
  }

  record.count++;
  
  if (record.count > limit) {
    return true;
  }

  return false;
}
