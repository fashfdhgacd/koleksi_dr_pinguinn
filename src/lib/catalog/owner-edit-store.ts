/**
 * Owner title/category edits from /pemilik ("Edit" on Upload terbaru / Cari video).
 * KV ANALYTICS_KV, key "owner:edit:v1". Applied at load time on top of overrides.json by
 * local-cache.ts (synced with the Unhide / owner hide lists every 30 s), so an edit shows within
 * about a minute without a commit or rebuild. Stored data is never rewritten; removing an entry
 * restores the original title/category.
 *
 * The minor-lock still applies: owner-tools.ts rejects locked/flagged items and minor-themed titles,
 * and local-cache.ts checks the edited title too, so an edit can only ever hide more, never less.
 */
import { resolveAnalyticsKV } from "@/lib/analytics-kv";

/** `extra`: additional category slugs the video also appears in (besides its main `category`). */
export type OwnerEdit = { title?: string; category?: string; extra?: string[]; at: number };
export const MAX_EXTRA_CATEGORIES = 6;
export type OwnerEditState = { ids: Record<string, OwnerEdit> };

const KEY = "owner:edit:v1";
const ID_RE = /^[A-Za-z0-9_-]{3,64}$/;
const SLUG_RE = /^[A-Za-z0-9_-]{1,60}$/;

function clean(raw: unknown): OwnerEditState {
  const out: OwnerEditState = { ids: {} };
  const ids = (raw as { ids?: unknown })?.ids;
  if (!ids || typeof ids !== "object") return out;
  for (const [id, v] of Object.entries(ids as Record<string, unknown>)) {
    if (!ID_RE.test(id) || !v || typeof v !== "object") continue;
    const rec = v as { title?: unknown; category?: unknown; extra?: unknown; at?: unknown };
    const title = typeof rec.title === "string" ? rec.title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const category = typeof rec.category === "string" && SLUG_RE.test(rec.category) ? rec.category : "";
    const extra = Array.isArray(rec.extra)
      ? [...new Set(rec.extra.filter((s): s is string => typeof s === "string" && SLUG_RE.test(s) && s !== category))].slice(
          0,
          MAX_EXTRA_CATEGORIES,
        )
      : [];
    if (!title && !category && !extra.length) continue;
    out.ids[id] = {
      ...(title ? { title } : {}),
      ...(category ? { category } : {}),
      ...(extra.length ? { extra } : {}),
      at: Number(rec.at) || 0,
    };
  }
  return out;
}

/** Reads all owner edits straight from KV. Throws when KV is not reachable. */
export async function readOwnerEditState(): Promise<OwnerEditState> {
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

/**
 * Write-path read: same key, shortest edge cache KV allows (30 s instead of the 60 s default), so a
 * save right after another save sees it more often. Only owner saves use this (never per visit).
 * KV stays eventually consistent; this narrows the window, it does not close it.
 */
async function readForWrite(kv: { get: (k: string, o?: { cacheTtl?: number }) => Promise<string | null> }): Promise<OwnerEditState> {
  const raw = await kv.get(KEY, { cacheTtl: 30 });
  if (!raw) return { ids: {} };
  try {
    return clean(JSON.parse(raw));
  } catch {
    return { ids: {} };
  }
}

/**
 * Merges one edit for `id` into the state read right before the write; only this id's entry
 * changes, so edits of other ids stored meanwhile are kept.
 * Extra categories: `extraAdd` / `extraRemove` (a delta, preferred) are applied to what is stored
 * now, so two saves close together both keep their changes. `extra` (full list, older clients)
 * replaces the list; undefined leaves it alone. Returns the stored edit (null = nothing left).
 */
export async function setOwnerEdit(
  id: string,
  edit: { title?: string; category?: string; extra?: string[]; extraAdd?: string[]; extraRemove?: string[] },
): Promise<OwnerEdit | null> {
  if (!ID_RE.test(id)) throw new Error("bad_id");
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  const state = await readForWrite(r.kv as never);
  const prev = state.ids[id] || { at: 0 };
  let extra = edit.extra;
  if (!extra && (edit.extraAdd?.length || edit.extraRemove?.length)) {
    const remove = new Set(edit.extraRemove || []);
    extra = [...(prev.extra || []).filter((s) => !remove.has(s))];
    for (const s of edit.extraAdd || []) if (!extra.includes(s) && extra.length < MAX_EXTRA_CATEGORIES) extra.push(s);
  }
  state.ids[id] = {
    ...prev,
    ...(edit.title ? { title: edit.title } : {}),
    ...(edit.category ? { category: edit.category } : {}),
    // An array (even empty) replaces the stored extra categories; undefined leaves them alone.
    ...(extra ? { extra } : {}),
    at: Date.now(),
  };
  const next = clean(state);
  await r.kv.put(KEY, JSON.stringify(next));
  // null = the edit only cleared the last extra category, nothing is stored for this id any more.
  return next.ids[id] || null;
}

/**
 * Bulk add/remove of extra category slugs for many ids in ONE KV read + ONE KV write
 * (/pemilik "Edit tag massal"). Never touches title or main category: `mainOf(id)` is the
 * current main slug, which is never added as an extra and never removed. An id that would go
 * over MAX_EXTRA_CATEGORIES keeps what fits and is reported in `full`.
 */
export async function bulkEditOwnerExtra(
  ids: string[],
  op: { add: string[]; remove: string[] },
  mainOf: (id: string) => string,
): Promise<{ changed: string[]; unchanged: string[]; full: string[]; extra: Record<string, string[]> }> {
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  // Delta (add/remove) applied per id to the state read right before the write.
  const state = await readForWrite(r.kv as never);
  const changed: string[] = [];
  const unchanged: string[] = [];
  const full: string[] = [];
  const now = Date.now();
  for (const id of ids) {
    if (!ID_RE.test(id)) continue;
    const prev = state.ids[id] || { at: 0 };
    const main = prev.category || mainOf(id);
    const before = (prev.extra || []).filter((s) => s !== main);
    let next = before.filter((s) => !op.remove.includes(s));
    let overflow = false;
    for (const s of op.add) {
      if (s === main || next.includes(s)) continue;
      if (next.length >= MAX_EXTRA_CATEGORIES) {
        overflow = true;
        continue;
      }
      next = [...next, s];
    }
    if (overflow) full.push(id);
    if (next.join(",") === before.join(",")) {
      unchanged.push(id);
      continue;
    }
    state.ids[id] = { ...prev, extra: next, at: now };
    changed.push(id);
  }
  const cleaned = clean(state);
  if (changed.length) await r.kv.put(KEY, JSON.stringify(cleaned));
  const extra: Record<string, string[]> = {};
  for (const id of changed) extra[id] = cleaned.ids[id]?.extra || [];
  return { changed, unchanged, full, extra };
}
