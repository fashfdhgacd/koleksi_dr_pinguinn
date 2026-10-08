/**
 * Owner "Unhide" overrides for hidden (minor/school-flagged) videos.
 * Server-side only: stored in KV (ANALYTICS_KV) under a single key, written only through the
 * owner-auth endpoint (/api/owner-tools, action "unhide"). Hidden stays the default: an id is
 * public again only while it is in this list, and removing it ("Sembunyikan lagi") hides it again.
 */
import { resolveAnalyticsKV } from "@/lib/analytics-kv";

export type UnhideEntry = { at: number };
export type UnhideState = { ids: Record<string, UnhideEntry> };

const KEY = "owner:unhide:v1";
const ID_RE = /^[A-Za-z0-9_-]{3,64}$/;

function clean(raw: unknown): UnhideState {
  const out: UnhideState = { ids: {} };
  const ids = (raw as { ids?: unknown })?.ids;
  if (ids && typeof ids === "object") {
    for (const [id, v] of Object.entries(ids as Record<string, unknown>)) {
      if (!ID_RE.test(id)) continue;
      const at = Number((v as { at?: unknown })?.at) || 0;
      out.ids[id] = { at };
    }
  }
  return out;
}

/** Reads the override list straight from KV. Throws when KV is not reachable. */
export async function readUnhideState(): Promise<UnhideState> {
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

export async function writeUnhideState(state: UnhideState): Promise<void> {
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  await r.kv.put(KEY, JSON.stringify(clean(state)));
}

/** Adds (unhide=true) or removes (unhide=false) one id. Returns the new state. */
export async function setUnhidden(id: string, unhide: boolean): Promise<UnhideState> {
  if (!ID_RE.test(id)) throw new Error("bad_id");
  const state = await readUnhideState();
  if (unhide) state.ids[id] = { at: Date.now() };
  else delete state.ids[id];
  await writeUnhideState(state);
  return state;
}
