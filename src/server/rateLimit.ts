/** Sliding-window rate limiter (single-process; mirrors studio/ratelimit.py). */

const buckets = new Map<string, number[]>();

function prune(key: string, windowS: number): number[] {
  const now = Date.now() / 1000;
  const bucket = buckets.get(key) ?? [];
  const fresh = bucket.filter((ts) => now - ts < windowS);
  buckets.set(key, fresh);
  return fresh;
}

export function allow(key: string, limit: number, windowS: number): boolean {
  const bucket = prune(key, windowS);
  if (bucket.length >= limit) return false;
  bucket.push(Date.now() / 1000);
  buckets.set(key, bucket);
  return true;
}

export function retryAfter(key: string, windowS: number): number {
  const bucket = prune(key, windowS);
  if (!bucket.length) return 0;
  return Math.max(1, Math.floor(windowS - (Date.now() / 1000 - bucket[0]!)));
}

export function resetForTests(): void {
  buckets.clear();
}
