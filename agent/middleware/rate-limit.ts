import type { Context, Env, Next } from 'hono';
import { AppError } from './error.js';

interface RateLimitOptions<E extends Env = Env> {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed per window */
  max: number;
  /** Custom key function — defaults to IP-based keying */
  keyFn?: (c: Context<E>) => string;
}

/**
 * Simple in-memory sliding-window rate limiter for Hono.
 *
 * Each named limiter has its own store. Timestamps older than
 * the window are pruned on each request and periodically via
 * a background cleanup interval.
 */
export function rateLimit<E extends Env = Env>(name: string, options: RateLimitOptions<E>) {
  const { windowMs, max, keyFn } = options;
  const store = new Map<string, number[]>();

  // Periodic cleanup every 60 seconds
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of store) {
      const filtered = timestamps.filter((t) => t > cutoff);
      if (filtered.length === 0) {
        store.delete(key);
      } else {
        store.set(key, filtered);
      }
    }
  }, 60_000);

  // Allow the process to exit cleanly
  if (cleanup.unref) cleanup.unref();

  return async (c: Context<E>, next: Next) => {
    // Prefer x-real-ip (set authoritatively by reverse proxies) over
    // x-forwarded-for (client-appendable, trivially spoofable).
    // If neither is present, all direct clients share one bucket — safe default.
    const key = keyFn
      ? keyFn(c)
      : c.req.header('x-real-ip') ||
        'unknown';

    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (store.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= max) {
      c.header('Retry-After', String(Math.ceil(windowMs / 1000)));
      throw new AppError(429, 'Too many requests');
    }

    timestamps.push(now);
    store.set(key, timestamps);
    await next();
  };
}
