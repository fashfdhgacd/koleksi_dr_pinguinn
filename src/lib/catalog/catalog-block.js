/**
 * Catalog removal blocklist (pure). An id here is gone from every catalog surface:
 * data files are skipped while the catalog is built, and categories, listings, search,
 * sitemap and related lists never see it. /watch answers 410 (or 404 when the id was
 * never in the catalog). Ingest and sync import the same rules and skip the id.
 *
 * The durable copy lives in catalog-blocklist.json (repo file, same kind of moderation
 * store as hidden-ids / image-blocklist). Live owner deletes also mirror the id into
 * KV (owner:catalog-block:v1) so the current deploy drops it before the next build.
 * That KV key is written only by the owner delete action, never on a normal visit.
 *
 * One id per request. Bulk removal is refused.
 */

export const BLOCK_ID_RE = /^[A-Za-z0-9_-]{3,64}$/;

/** Surfaces a confirmed delete drops the id from. */
export const REMOVAL_SURFACES = ["data-files", "categories", "listings", "search", "sitemap", "related"];

/**
 * @param {unknown} raw file JSON `{ ids: { [id]: { at } } }` or a loose map
 * @returns {{ ids: Record<string, { at: number }> }}
 */
export function normalizeBlockState(raw) {
  /** @type {Record<string, { at: number }>} */
  const ids = {};
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? /** @type {Record<string, unknown>} */ (raw) : {};
  const nested = rec.ids && typeof rec.ids === "object" && !Array.isArray(rec.ids) ? /** @type {Record<string, unknown>} */ (rec.ids) : null;
  const src = nested || rec;
  for (const [id, v] of Object.entries(src)) {
    if (!BLOCK_ID_RE.test(id)) continue;
    const at = v && typeof v === "object" && "at" in v ? Number(/** @type {{ at?: unknown }} */ (v).at) : Number(v);
    ids[id] = { at: Number.isFinite(at) ? at : 0 };
  }
  return { ids };
}

/** @param {unknown} raw @returns {Set<string>} */
export function blockedIdSet(raw) {
  const { ids } = normalizeBlockState(raw);
  const out = new Set(Object.keys(ids));
  for (const id of Object.keys(ids)) out.add(id.toLowerCase());
  return out;
}

/**
 * @param {string} id
 * @param {Set<string> | null | undefined} blocked
 */
export function isBlockedId(id, blocked) {
  const s = String(id || "").trim();
  if (!s || !blocked || !blocked.size) return false;
  return blocked.has(s) || blocked.has(s.toLowerCase());
}

/**
 * Drop blocked rows. Items without an id are kept (callers already reject them later).
 * @param {unknown[]} items
 * @param {Set<string> | null | undefined} blocked
 * @returns {any[]}
 */
export function withoutBlocked(items, blocked) {
  if (!Array.isArray(items) || !blocked || !blocked.size) return items;
  return items.filter((it) => {
    const id = it && typeof it === "object" ? String(/** @type {{ id?: unknown }} */ (it).id || "") : "";
    return !isBlockedId(id, blocked);
  });
}

/** Title slug used by owner search (id / title / slug). */
/** @param {string} title */
export function titleSlug(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * One catalog id, or a refusal. Arrays, comma-separated lists and bulk flags are refused
 * so this endpoint cannot delete the locked set in one call.
 * @param {unknown} body
 * @returns {{ id: string } | { error: "bad_id" | "no_bulk" }}
 */
export function singleRemoveId(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "bad_id" };
  const rec = /** @type {Record<string, unknown>} */ (body);
  if (Array.isArray(rec.ids) || Array.isArray(rec.id)) return { error: "no_bulk" };
  if (rec.all === true || rec.bulk === true) return { error: "no_bulk" };
  const id = String(rec.id || "").trim();
  if (/[,\s]/.test(id)) return { error: "no_bulk" };
  if (!BLOCK_ID_RE.test(id)) return { error: "bad_id" };
  return { id };
}

/**
 * What a delete will do. `found` false → watch 404 (unknown id). Found → 410 once blocked.
 * @param {string} id
 * @param {boolean} found
 */
export function removalPlan(id, found) {
  return {
    id,
    found: Boolean(found),
    surfaces: REMOVAL_SURFACES.slice(),
    watch: found ? 410 : 404,
  };
}
