/**
 * Owner "Sembunyikan" list for any video (e.g. one that keeps failing to play), set from the
 * "Player error" card in /pemilik. KV ANALYTICS_KV, key "owner:hide:v1". Nothing is deleted: the
 * video only leaves listings, search, sitemap and /watch (404) until the owner shows it again.
 * Synced by local-cache.ts together with the Unhide list (every 30 s) and exposed (ids only) by
 * /api/hidden-ids for client navigation.
 */
import { resolveAnalyticsKV } from "@/lib/analytics-kv";

export type OwnerHideState = { ids: Record<string, { at: number }> };

const KEY = "owner:hide:v1";
const ID_RE = /^[A-Za-z0-9_-]{3,64}$/;

function clean(raw: unknown): OwnerHideState {
  const out: OwnerHideState = { ids: {} };
  const ids = (raw as { ids?: unknown })?.ids;
  if (ids && typeof ids === "object") {
    for (const [id, v] of Object.entries(ids as Record<string, unknown>)) {
      if (!ID_RE.test(id)) continue;
      out.ids[id] = { at: Number((v as { at?: unknown })?.at) || 0 };
    }
  }
  return out;
}

/** Reads the owner hide list straight from KV. Throws when KV is not reachable. */
export async function readOwnerHideState(): Promise<OwnerHideState> {
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  const raw = await r.kv.get(KEY);
  if (!raw) return { ids: {} };
  try {
    return clean(JSON.parse(raw));
  } catch {
    return { ids: {} };
  }
}

/** Adds (hide=true) or removes (hide=false) one id. Returns the new state. */
export async function setOwnerHidden(id: string, hide: boolean): Promise<OwnerHideState> {
  if (!ID_RE.test(id)) throw new Error("bad_id");
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  const state = await readOwnerHideState();
  if (hide) state.ids[id] = { at: Date.now() };
  else delete state.ids[id];
  await r.kv.put(KEY, JSON.stringify(clean(state)));
  return state;
}
