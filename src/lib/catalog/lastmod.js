/**
 * Sitemap lastmod = date of the last *significant* change of the page, not simply the upload date.
 * Significant for a video page: upload, or an owner edit of its title / category. Views, likes and
 * re-builds do not count. Dates are never in the future (crawlers ignore lastmod after a bad one).
 */

/** @param {unknown} raw @returns {number | null} epoch ms */
export function toMs(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw < 1e12 ? raw * 1000 : raw;
  if (typeof raw === "string") {
    const d = new Date(raw.trim());
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

/**
 * @param {unknown} uploadRaw createdAt/date of the item
 * @param {number | undefined} editAt owner edit time (ms) when the title/category was changed
 * @param {number} [now]
 * @returns {string | undefined} YYYY-MM-DD
 */
export function significantLastmod(uploadRaw, editAt, now = Date.now()) {
  const times = /** @type {number[]} */ ([toMs(uploadRaw), toMs(editAt)].filter((t) => t != null && t <= now + 86400000));
  if (!times.length) return undefined;
  const best = Math.min(Math.max(...times), now);
  return new Date(best).toISOString().slice(0, 10);
}

/** Date each static page last changed in a way users or crawlers care about (bump when editing it). */
export const STATIC_PAGE_LASTMOD = {
  "/tentang": "2026-11-02",
  "/syarat": "2026-10-01",
  "/privasi": "2026-10-01",
  "/2257": "2026-10-01",
  "/dmca": "2026-11-04",
  "/kontak": "2026-11-04",
  "/teman": "2026-10-15",
};
