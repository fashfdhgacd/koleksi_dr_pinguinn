/**
 * Episode series detection for the watch page "Lainnya di …" links.
 *
 * A video belongs to a series only when its title has either
 *  (a) an explicit episode marker with a number: "Eps 04", "Episode 2", "Ep. 3", "EP02", "Epiose 5"
 *      (typo), "Part 2", "Bagian 3", "Part #2", "第3集", also glued to the previous word
 *      ("TerakotaEpisode 2"); or
 *  (b) a trailing episode number on an otherwise identical title: "Judul (3)", "Judul 3", "Judul #3".
 * Matching tolerates case, spacing ("Tentara  Terakota" = "TentaraTerakota"), punctuation, the site
 * suffix and end-of-title noise (HD, Sub Indo, End, CJK subtitles). Every letter and digit of the base
 * title must still match, so merely similar titles never merge.
 * Numbers must be small (1–99). Counts like "5X", years, resolutions, ages (18/19 as a plain
 * trailing number are only accepted inside a real sequence), and JAV codes ("ABC-123") never match.
 * A series needs at least 2 videos with the same normalized base title. Built once per catalog
 * build (WeakMap memo on the item array), no KV/D1 read.
 */

// Site suffix in its usual spellings: "- koleksidrpinguin.com", "| KoleksiDrPinguin", "(Koleksi Dr. Pinguin)".
const SITE_SUFFIX =
  /\s*[-–—|:·]?\s*[([]?\s*(?:https?:\/\/)?(?:www\.)?(?:koleksi\s*)?dr\.?\s*pinguin(?:\.(?:com|site))?\s*[)\]]?\s*$/i;
// Noise that uploads add at the end and that differs between episodes of one series: quality tags,
// "Sub Indo", "End/Tamat", and bracketed or bare CJK subtitles ("【中文字幕】", "完结").
const TAIL_TAG =
  /\s*[-–—|:·,]?\s*(?<![\p{L}\p{N}])(?:full\s*hd|fhd|uhd|hd|4k|\d{3,4}p|sub(?:title)?\s*indo(?:nesia)?|indo\s*sub|end|tamat|final|uncen(?:sored)?)[.!]*\s*$/iu;
// Bracketed tail without digits ("[Sub Indo]", "【中文字幕】"), or a bare resolution ("[1080p]"); a bracket
// with a number in it ("(3)", "(Part 2)") is kept for the episode rules below.
const TAIL_BRACKET = /\s*[[【(（「『](?:[^\]】)）」』\d]*|\s*\d{3,4}p\s*)[\]】)）」』]\s*$/i;
// Not right after a digit or 第, so "第3集" stays whole for CJK_MARKER.
const TAIL_CJK = /(?<![\d第])[\s\-–—|:·,]*[\u3000-\u303f\u3040-\u30ff\u3400-\u9fff\uff00-\uffef][\u3000-\u303f\u3040-\u30ff\u3400-\u9fff\uff00-\uffef\s!！?？.。、,，]*$/;
const LATIN_WORD = /[a-z]{3}/i;

// Episode marker words, with the typos uploads use ("Epiose", "Epsiode", "Episod").
const WORDS = "episode|episod|epiose|epsiode|eps|ep|part|bagian";
// After the word: optional "." and/or "#", spaces optional ("EP02", "Eps.3", "Part #2"), number
// 1–99 with leading zeros allowed, then not another digit / "x" / "k" / "p" ("5x", "4k", "720p")
// and not a letter ("Part 2nd"); CJK noise right after the number is fine.
const NUM = String.raw`\.?\s*[#:]?\s*0*(\d{1,2})(?![\d])(?![xX×kKpP](?![a-zA-Z]))(?=$|[^\p{L}\p{N}]|[\u3040-\u30ff\u3400-\u9fff])`;
// (1) Whole-word marker, any case: "Eps 04", "EP02", "Ep. 3", "bagian 2". "(?<![\p{L}\p{N}])" keeps
//     "Part" in "Apartemen" or "ep" in "Keep 2" out.
const MARKER = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${WORDS})${NUM}`, "iu");
// (2) Marker glued to the previous word ("TerakotaEpisode 2"): only a capitalised marker right after a
//     lowercase letter (camel case), or the long word "episode" itself after any letter.
const GLUED = new RegExp(
  String.raw`(?<=\p{Ll})(?:Episode|Episod|Epiose|Epsiode|EPISODE|Eps|EPS|Ep|EP|Part|PART|Bagian|BAGIAN)${NUM}`,
  "u",
);
const GLUED_LONG = new RegExp(String.raw`(?<=\p{L})(?:episode|episod|epiose|epsiode)${NUM}`, "iu");
// Season/episode code "S01E02" / "S1 EP2": the season stays in the key, the episode is the number.
const SEASON_EP = /(?<![\p{L}\p{N}])s0*(\d{1,2})\s*[-.]?\s*e(?:ps?)?\s*0*(\d{1,2})(?!\d)(?![\p{L}])/iu;
const CJK_MARKER = /第\s*0*(\d{1,2})\s*[集话話部回]/;
// Trailing number: "(3)", "(03)", "#3", "#03", or a bare " 3" at the very end (after suffix noise is
// stripped). A bare number takes no leading zeros: "Agent 007" is not episode 7.
const TRAILING = /(?:\s\(0*(\d{1,2})\)|\s#\s*0*(\d{1,2})|\s(\d{1,2}))\s*$/;
const JAV_CODE = /\b[a-z]{2,6}-\d{2,5}\b/i;

/** words: base title words, only for trailing-number keys (plausibility check in seriesIndex). */
export type SeriesInfo = { key: string; ep: number; sub: number; words?: string };

/** Strips the site suffix and end-of-title noise (repeatedly: "Judul Ep 2 HD - koleksidrpinguin.com"). */
function stripTail(raw: string): string {
  let t = raw.normalize("NFKC").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 4; i++) {
    const before = t;
    t = t.replace(SITE_SUFFIX, "").trim();
    t = t.replace(TAIL_TAG, "").trim();
    t = t.replace(TAIL_BRACKET, "").trim();
    // Trailing CJK only as noise after a Latin title; a CJK title keeps its words.
    if (LATIN_WORD.test(t.replace(TAIL_CJK, ""))) t = t.replace(TAIL_CJK, "").trim();
    t = t.replace(/[\s\-–—|:·,]+$/, "").trim();
    if (t === before) break;
  }
  return t;
}

/** Words of a base title (lowercase, punctuation as spaces). */
function baseWords(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Series key + episode number for one title, or null when the title has no episode number. */
export function parseSeries(rawTitle: string): SeriesInfo | null {
  const t = stripTail(String(rawTitle || ""));
  if (!t) return null;
  let rest = t;
  let ep = 0;
  const se = SEASON_EP.exec(rest);
  if (se) {
    ep = Number(se[2]);
    rest = `${rest.slice(0, se.index)} s${Number(se[1])} ${rest.slice(se.index + se[0].length)}`.trim();
  }
  // With an S01E02 code, a repeated "Episode 2" only leaves the key; another number ("Part 3") is
  // part of the series name.
  const m = se
    ? [MARKER, GLUED, GLUED_LONG]
        .flatMap((r) => [...rest.matchAll(new RegExp(r.source, r.flags + "g"))])
        .find((x) => Number(x[1]) === ep)
    : MARKER.exec(rest) || GLUED.exec(rest) || GLUED_LONG.exec(rest) || CJK_MARKER.exec(rest);
  if (m && m.index !== undefined) {
    if (!se) ep = Number(m[1]);
    rest = (rest.slice(0, m.index) + " " + stripTail(rest.slice(m.index + m[0].length))).trim();
  }
  let sub = 0;
  const tr = TRAILING.exec(rest);
  if (tr) {
    const n = Number(tr[1] || tr[2] || tr[3]);
    const plain = Boolean(tr[3]);
    // A bare trailing number right after a JAV code is part of the code, not an episode.
    if (n && !(plain && JAV_CODE.test(rest.slice(Math.max(0, tr.index - 12))))) {
      if (ep) sub = n;
      else ep = n;
      rest = rest.slice(0, tr.index).trim();
    }
  }
  if (!ep || ep > 99) return null;
  const words = baseWords(rest);
  // Spacing-insensitive key ("Tentara  Terakota" = "TentaraTerakota"); only spaces and punctuation are
  // dropped, every letter and digit must match, so merely similar titles never share a key.
  const key = words.replace(/ /g, "");
  if (key.length < 3) return null;
  return se || m ? { key: "m:" + key, ep, sub } : { key: "t:" + key, ep, sub, words };
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
  const words = new Map<string, string>();
  for (const it of items) {
    const id = String(it?.id || "");
    if (!id) continue;
    const s = parseSeries(String(it?.title || ""));
    if (!s) continue;
    let arr = tmp.get(s.key);
    if (!arr) tmp.set(s.key, (arr = []));
    if (!words.has(s.key)) words.set(s.key, s.words || "");
    if (!arr.some((x) => x.id === id)) arr.push({ id, ep: s.ep, sub: s.sub });
  }
  const byId = new Map<string, string>();
  const groups = new Map<string, string[]>();
  for (const [key, arr] of tmp) {
    if (arr.length < 2) continue;
    if (key.startsWith("t:") && !plausibleTrailingSeries(words.get(key) || "", arr)) continue;
    arr.sort((a, b) => a.ep - b.ep || a.sub - b.sub);
    const ids = arr.map((x) => x.id);
    groups.set(key, ids);
    for (const id of ids) byId.set(id, key);
  }
  const out = { byId, groups };
  memo.set(items, out);
  return out;
}
