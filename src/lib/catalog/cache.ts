type CacheRecord<T> = {
  value: T;
  expires: number;
};

const MAX_ENTRIES = 200;

const store = new Map<string, CacheRecord<unknown>>();
const lastGood = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

function evictIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  const extra = store.size - MAX_ENTRIES;
  let removed = 0;
  for (const key of store.keys()) {
    store.delete(key);
    removed += 1;
    if (removed >= extra) break;
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key) as CacheRecord<T> | undefined;
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

export function cachePeekStale<T>(key: string): T | undefined {
  return lastGood.get(key) as T | undefined;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number) {
  store.set(key, { value, expires: Date.now() + ttlMs });
  lastGood.set(key, value);
  evictIfNeeded();
}

export async function singleflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = factory().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}
