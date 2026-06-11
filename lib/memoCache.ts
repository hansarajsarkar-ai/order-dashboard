// Tiny in-memory TTL cache for slow-changing, parameterless aggregate queries.
// Lives per warm serverless instance — repeat dashboard loads within the TTL
// skip the DB round-trip entirely. Falls back to a fresh query on miss/expiry.
const store = new Map<string, { data: unknown; exp: number }>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.data as T;
  const data = await fn();
  store.set(key, { data, exp: Date.now() + ttlMs });
  return data;
}
