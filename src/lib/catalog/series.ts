/**
 * Episode series detection for the watch page "Lainnya di …" links.
 *
 * A video belongs to a series only when its title has either
 *  (a) an explicit episode marker with a number: "Eps 04", "Episode 2", "Ep. 3", "Epiose 5" (typo seen
 *      in the catalog), "Part 2", "Bagian 3", "第3集"; or
 *  (b) a trailing episode number on an otherwise identical title: "Judul (3)", "Judul 3", "Judul #3".
 * Numbers must be small (1–99). Counts like "5X", years, resolutions, ages (18/19 as a plain
 * trailing number are only accepted inside a real sequence), and JAV codes ("ABC-123") never match.
 * A series needs at least 2 videos with the same normalized base title. Built once per catalog
 * build (WeakMap memo on the item array), no KV/D1 read.
 */

const SITE_SUFFIX = /\s*[-–—|]\s*koleksidrpinguin\.com\s*$/i;
// Whole-word explicit markers. "\b" before the word keeps "Part" inside "Apartemen" out.
const MARKER = /(?:^|[\s([\-–—:·,])(?:eps?|epi?sode|epiose|episod|part|bagian)\.?\s*#?\s*(\d{1,2})(?![\dx×kp])(?=$|[\s)\]\-–—:·,.!?])/i;
const CJK_MARKER = /第\s*(\d{1,2})\s*[集话話部]/;
// Trailing number: "(3)", "#3", or " 3" at the very end (after the site suffix is stripped).
const TRAILING = /(?:\s\((\d{1,2})\)|\s#(\d{1,2})|\s(\d{1,2}))\s*$/;
const JAV_CODE = /\b[a-z]{2,6}-\d{2,5}\b/i;

export type SeriesInfo = { key: string; ep: number; sub: number };

function baseKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s·•|:,.!?~\-–—_()[\]]+/g, " ")
    .trim();
}

/** Series key + episode number for one title, or null when the title has no episode number. */
export function parseSeries(rawTitle: string): SeriesInfo | null {
  const t = String(rawTitle || "").replace(SITE_SUFFIX, "").trim();
  if (!t) return null;
  let rest = t;
  let ep = 0;
  const m = MARKER.exec(rest) || CJK_MARKER.exec(rest);
  if (m) {
    ep = Number(m[1]);
    rest = (rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length)).trim();
  }
  let sub = 0;
  const tr = TRAILING.exec(rest);
  if (tr) {
    const n = Number(tr[1] || tr[2] || tr[3]);
    const plain = Boolean(tr[3]);
    // A bare trailing number right after a JAV code is part of the code, not an episode.
    if (!(plain && JAV_CODE.test(rest.slice(Math.max(0, tr.index - 12))))) {
      if (ep) sub = n;
      else ep = n;
      rest = rest.slice(0, tr.index).trim();
    }
  }
  if (!ep || ep > 99) return null;
  const key = baseKey(rest);
  if (key.length < 3) return null;
  return { key: (m ? "m:" : "t:") + key, ep, sub };
}

/**
 * Generic uploader / brand titles that carry a running counter ("Koleksi Dr Pinguin Bokep 12",
 * "Videy viral terbaru 3", "Anime Hentai 7") are separate videos, not episodes.
 */
const GENERIC_BASE = /pinguin|videy|github|setup|bsky|social|javday|\bpage\b|\bmp4\b|penc[oi]li|have fun|jerk off|\bcoli\b|\bviral\b|\bai (?:china|com|bokep)\b|^(?:ai|anime hentai|love story|tobrut|nov|chill \S+|inews \S+)$/;
const HAS_CJK = /[\u3040-\u30ff\u3400-\u9fff]/;

/** Trailing-number groups: specific base title (≥3 words, or CJK/accented short-drama names) and a
 * tight sequence: numbers mostly distinct, starting low, without big gaps. */
function plausibleTrailingSeries(base: string, arr: Array<{ ep: number }>): boolean {
  if (GENERIC_BASE.test(base)) return false;
  if (!HAS_CJK.test(base) && base.split(" ").length < 3 && !/[^\x00-\x7f]/.test(base)) return false;
  const eps = [...new Set(arr.map((x) => x.ep))].sort((a, b) => a - b);
  if (eps.length < 2 || eps.length < arr.length * 0.8) return false;
  const span = eps[eps.length - 1] - eps[0] + 1;
  return eps[0] <= 10 && span <= eps.length * 2;
}

type Item = { id?: unknown; title?: unknown };

/** Map series key -> ids sorted by episode; only groups with ≥2 videos. Memoized per item array. */
const memo = new WeakMap<object, { byId: Map<string, string>; groups: Map<string, string[]> }>();

export function seriesIndex(items: readonly Item[]): { byId: Map<string, string>; groups: Map<string, string[]> } {
  const hit = memo.get(items);
  if (hit) return hit;
  const tmp = new Map<string, Array<{ id: string; ep: number; sub: number }>>();
  for (const it of items) {
    const id = String(it?.id || "");
    if (!id) continue;
    const s = parseSeries(String(it?.title || ""));
    if (!s) continue;
    let arr = tmp.get(s.key);
    if (!arr) tmp.set(s.key, (arr = []));
    if (!arr.some((x) => x.id === id)) arr.push({ id, ep: s.ep, sub: s.sub });
  }
  const byId = new Map<string, string>();
  const groups = new Map<string, string[]>();
  for (const [key, arr] of tmp) {
    if (arr.length < 2) continue;
    if (key.startsWith("t:") && !plausibleTrailingSeries(key.slice(2), arr)) continue;
    arr.sort((a, b) => a.ep - b.ep || a.sub - b.sub);
    const ids = arr.map((x) => x.id);
    groups.set(key, ids);
    for (const id of ids) byId.set(id, key);
  }
  const out = { byId, groups };
  memo.set(items, out);
  return out;
}
