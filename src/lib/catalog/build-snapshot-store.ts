/**
 * Keeps the built-catalog snapshot (build-snapshot.ts) in the Cache API of the data centre, so only
 * the first cold isolate per data centre per deploy (and per owner hide/unhide/edit list) pays the
 * full catalog build; later cold isolates there read it back (~20 ms CPU instead of ~1.2 s).
 *
 * Cost: Cache API reads/writes are free (no KV, no D1, no new binding, no env var). One write per
 * data centre per catalog build, never per visit; no timers, no polling. The key carries the deploy
 * version id (CF_VERSION_METADATA, already bound for the edge page cache), so a snapshot is only ever
 * read by the same code and bundled data that wrote it. A separate named cache, never served to
 * visitors. Outside Cloudflare (dev, node tests) every call is a no-op and the catalog builds as before.
 */
import { SNAPSHOT_SCHEMA } from "./build-snapshot";

const CACHE_NAME = "kdp-catalog-snapshot";
/** Snapshot lives a week at most; a new deploy uses a new key anyway. */
const MAX_AGE_S = 7 * 24 * 3600;

type WorkersModule = {
  env?: { CF_VERSION_METADATA?: { id?: unknown } };
  waitUntil?: (p: Promise<unknown>) => void;
};

let modPromise: Promise<WorkersModule | null> | null = null;
/** The loaded module (set once the import resolved), so waitUntil can be called synchronously. */
let loadedMod: WorkersModule | null = null;
function workersModule(): Promise<WorkersModule | null> {
  if (!import.meta.env.SSR) return Promise.resolve(null);
  // Inside try/await like analytics-kv.ts: the bundler leaves an unresolvable import() in a try alone.
  modPromise ??= (async () => {
    try {
      loadedMod = (await import("cloudflare:workers")) as unknown as WorkersModule;
      return loadedMod;
    } catch {
      return null;
    }
  })();
  return modPromise;
}

/**
 * Keeps the isolate alive for a background job until it settles (waitUntil of the current request).
 * Called synchronously while the request is still running; outside Workers it does nothing.
 */
export function keepAlive(job: Promise<unknown>): void {
  try {
    loadedMod?.waitUntil?.(job);
  } catch {
    // outside a request context: the job still runs as long as the isolate lives
  }
}

type CacheLike = {
  match(key: string): Promise<Response | undefined>;
  put(key: string, res: Response): Promise<void>;
};

function cacheStorage(): { open(name: string): Promise<CacheLike> } | null {
  const c = (globalThis as { caches?: { open?: unknown } }).caches;
  return c && typeof c.open === "function" ? (c as { open(name: string): Promise<CacheLike> }) : null;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Cache key for a build made under the given owner list key (unhideKey), or null when there is no
 * deploy version or no Cache API (then: no snapshot, normal build).
 */
export async function snapshotKey(listKey: string): Promise<string | null> {
  try {
    if (!cacheStorage()) return null;
    const mod = await workersModule();
    const version = mod?.env?.CF_VERSION_METADATA?.id;
    if (typeof version !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(version)) return null;
    const lists = (await sha256Hex(listKey)).slice(0, 32);
    return `https://koleksidrpinguin.com/__catalog-snapshot/s${SNAPSHOT_SCHEMA}/${version}/${lists}`;
  } catch {
    return null;
  }
}

/** Snapshot text, or null (missing, expired, or any error). */
export async function readSnapshot(key: string): Promise<string | null> {
  try {
    const store = cacheStorage();
    if (!store) return null;
    const res = await (await store.open(CACHE_NAME)).match(key);
    if (!res || !res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Stores the snapshot; never throws. Callers run it in the background (keepAlive). */
export async function writeSnapshot(key: string, text: string): Promise<void> {
  try {
    const store = cacheStorage();
    if (!store) return;
    const res = new Response(text, {
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${MAX_AGE_S}` },
    });
    await (await store.open(CACHE_NAME)).put(key, res);
  } catch {
    // best effort: the next cold isolate builds and tries again
  }
}
