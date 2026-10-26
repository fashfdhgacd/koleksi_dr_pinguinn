// Shared naming contract for chunked feeds in data/ (used by the Telegram bot writer in
// src/lib/bot/github.js, the site loader in local-cache.ts and the build guard
// scripts/check-catalog.mjs). Change it here only, so writer and reader cannot drift apart.
//
//   <feed>.json        first chunk (newest uploads)
//   <feed>-pNN.json    later chunks (NN = 02, 03, ...)
//   <feed>-index.json  ordered list of chunk file names the bot has committed

/** Feeds the site bundles. A chunked feed not listed here fails the build guard. */
export const CHUNKED_FEEDS = ["videos-latest", "putarin-latest"];

/** @param {unknown} name */
export function feedBase(name) {
  return String(name || "")
    .replace(/^.*\//, "")
    .replace(/\.json$/i, "")
    .replace(/-index$/i, "")
    .replace(/-p\d+$/i, "");
}

/** @param {string} base @param {number} n */
export function chunkFileName(base, n) {
  return n <= 1 ? `${base}.json` : `${base}-p${String(n).padStart(2, "0")}.json`;
}

/** @param {string} base */
export function indexFileName(base) {
  return `${feedBase(base)}-index.json`;
}

/** @param {unknown} name */
export function isIndexFile(name) {
  return /-index\.json$/i.test(String(name || ""));
}

/** Chunk number of a file name: 1 for "<feed>.json", NN for "<feed>-pNN.json", 0 if not a chunk. */
/** @param {unknown} name */
export function chunkNumber(name) {
  const file = String(name || "").replace(/^.*\//, "");
  if (isIndexFile(file) || !/\.json$/i.test(file)) return 0;
  const m = /-p(\d+)\.json$/i.exec(file);
  return m ? Number(m[1]) : 1;
}

/** Index content is either ["a.json", ...] or { parts: [...] } (both written by the bot). */
/** @param {unknown} index @returns {string[]} */
export function indexParts(index) {
  /** @type {any} */
  const idx = index;
  /** @type {unknown[]} */
  const list = Array.isArray(idx) ? idx : Array.isArray(idx?.parts) ? idx.parts : [];
  return list.map((p) => String(p || "").replace(/^.*\//, "")).filter(Boolean);
}

/**
 * Merge bundled chunk modules into one list. `modules` maps a path to its parsed JSON
 * (import.meta.glob eager). Order follows the index; chunks present but not in the index are
 * still served (appended by number), so a stale index never hides videos. A chunk that is not
 * an array is skipped and reported instead of breaking the whole catalog.
 */
/** @param {Record<string, unknown>} modules @param {unknown} index @param {string} [label] @returns {unknown[]} */
export function mergeChunks(modules, index, label = "feed") {
  /** @type {Map<string, unknown>} */
  const byName = new Map();
  for (const [path, value] of Object.entries(modules || {})) {
    const name = path.replace(/^.*\//, "");
    if (chunkNumber(name) > 0) byName.set(name, value);
  }
  /** @type {string[]} */
  const order = [];
  for (const name of indexParts(index)) if (byName.has(name) && !order.includes(name)) order.push(name);
  const rest = [...byName.keys()].filter((n) => !order.includes(n)).sort((a, b) => chunkNumber(a) - chunkNumber(b));
  /** @type {unknown[]} */
  const items = [];
  /** @type {string[]} */
  const problems = [];
  for (const name of [...order, ...rest]) {
    const value = byName.get(name);
    if (!Array.isArray(value)) {
      problems.push(`${label}: ${name} is not a list, skipped`);
      continue;
    }
    for (const it of value) if (it && typeof it === "object") items.push(it);
  }
  for (const name of indexParts(index)) if (!byName.has(name)) problems.push(`${label}: index lists missing ${name}`);
  if (problems.length && typeof console !== "undefined") console.error("[catalog-chunks]", problems.join("; "));
  return items;
}
