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

/**
 * This isolate's recent writes. KV reads are edge-cached (up to ~60 s), so a read right after a
 * write can return the old list; a second quick Tayangkan/hide then wrote the old list back and the
 * first decision vanished. Reads overlay these entries for 2 minutes. In memory only, no extra KV.
 */
const JOURNAL_MS = 120_000;
const journal = new Map<string, { on: boolean; at: number }>();

function withJournal(state: UnhideState): UnhideState {
  const now = Date.now();
  for (const [id, j] of journal) {
    if (now - j.at > JOURNAL_MS) {
      journal.delete(id);
      continue;
    }
    if (j.on) state.ids[id] = { ...(state.ids[id] || {}), at: state.ids[id]?.at || j.at };
    else delete state.ids[id];
  }
  return state;
}

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
  if (!raw) return withJournal({ ids: {} });
  try {
    return withJournal(clean(JSON.parse(raw)));
  } catch {
    return withJournal({ ids: {} });
  }
}

export async function writeUnhideState(state: UnhideState): Promise<void> {
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  await r.kv.put(KEY, JSON.stringify(clean(state)));
  // A whole-list write (bulk) is the newest truth for ids the journal still tracks.
  const now = Date.now();
  for (const id of journal.keys()) journal.set(id, { on: Boolean(state.ids[id]), at: now });
}

/** Adds (unhide=true) or removes (unhide=false) one id. Returns the new state. */
export async function setUnhidden(id: string, unhide: boolean): Promise<UnhideState> {
  if (!ID_RE.test(id)) throw new Error("bad_id");
  const state = await readUnhideState();
  if (unhide) state.ids[id] = { at: Date.now() };
  else delete state.ids[id];
  await writeUnhideState(state);
  journal.set(id, { on: unhide, at: Date.now() });
  return state;
}
