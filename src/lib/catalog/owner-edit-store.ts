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

/** Merges one edit (title and/or category) for `id`. Returns the stored edit. */
export async function setOwnerEdit(
  id: string,
  edit: { title?: string; category?: string; extra?: string[] },
): Promise<OwnerEdit | null> {
  if (!ID_RE.test(id)) throw new Error("bad_id");
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  const state = await readOwnerEditState();
  const prev = state.ids[id] || { at: 0 };
  state.ids[id] = {
    ...prev,
    ...(edit.title ? { title: edit.title } : {}),
    ...(edit.category ? { category: edit.category } : {}),
    // An array (even empty) replaces the stored extra categories; undefined leaves them alone.
    ...(edit.extra ? { extra: edit.extra } : {}),
    at: Date.now(),
  };
  const next = clean(state);
  await r.kv.put(KEY, JSON.stringify(next));
  // null = the edit only cleared the last extra category, nothing is stored for this id any more.
  return next.ids[id] || null;
}
