/**
 * Shared title-based category refinement (site catalog + Telegram bot).
 *
 * Both classifiers (site `classify` in local-shared.ts and bot `detectCategory` in
 * bot/parse.js) first pick a base category with their existing rules; `refineCategory`
 * then only:
 *  - moves items out of the generic buckets (amatir / lainnya / umum) when a more
 *    specific category clearly matches, and
 *  - fixes a few clearly-better cases (abg → mahasiswi, istri-by-"selingkuh"-only →
 *    selingkuh). Threesome titles share the existing gangbang bucket.
 * Nothing is rewritten in stored data; this runs at load/upload time only.
 * No category here implies minors.
 */

/** @param {string} title */
export function normCategoryText(title = "") {
  return String(title)
    .toLowerCase()
    .replace(/[_–—./\-|()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const GENERIC_CATEGORY_SLUGS = new Set(["", "amatir", "lainnya", "umum", "bokep", "campur"]);

const MAHASISWI = /mahasisw|\bkampus\b|\bkuliah|\bdosen\b|\bmaba\b/;
const SELINGKUH = /selingkuh|\bbinor\b|istri orang|suami orang|\bpelakor\b|\bcuckold\b|\bntr\b/;
const THREESOME = /threesome|\b3some\b|bertiga|foursome|berempat|\bmmf\b|\bffm\b/;

/** Order matters: first match wins (most specific themes first). */
export const EXTRA_CATEGORY_RULES = [
  ["hentai", /\bhentai\b/],
  [
    "jav",
    /\bjav\b|\b(?:ipzz|ipx|ipz|meyd|ssis|ssni|sone|mide|pred|juq|jul|abp|abw|cawd|mird|hnd|waaa|ebod|pppd|miaa|jufe|dass|adn|roe|mimk|snis|sdde|mukd|nacr|hmn|kawd|jux|ure|stars)\s?\d{3,5}\b|\bfc2\s?(?:ppv\s?)?\d{6,7}\b/,
  ],
  ["mahasiswi", MAHASISWI],
  ["selingkuh", SELINGKUH],
  ["gangbang", THREESOME],
  ["hamil", /\bhamil\b|\bbumil\b/],
  ["ojol", /\bojol\b|\bojek\b|\bgojek\b|\bgrab\b/],
  [
    "barat",
    /\bbule\b|\bwestern\b|\bpirang\b|\bblonde\b|\bamerika|\bamerican\b|\beropa\b|\beurope|\brussian\b|\brusia\b|\blatina\b|\bbrazil|\binterracial\b|\bbbc\b/,
  ],
  ["selebgram", /selebgram|\bseleb\b|tiktok|selebtok|\bbigo\b|influencer|\bartis\b|onlyfans/],
  ["sepong", /sepong|\bblowjob\b|\boral\b|\bkulum|ngulum|\bngemut|deepthroat|\bbj\b|jilat kontol|isep kontol/],
  ["crot-dalam", /creampie|crot (?:di ?)?(?:dalam|dalem)|crot didalam|keluar(?:in)? di ?(?:dalam|dalem)/],
  ["wot", /\bwot\b|woman on top|\bgoyang|\bngulek/],
  ["hotel", /\bhotel\b|\bmotel\b|\bvilla\b|\bcheck ?in\b|\bcekin\b|\boyo\b|penginapan|\bapartemen|\bapartment/],
  ["kosan", /\bkosan\b|\bkost?\b|kos kosan|\bngekos|\bkostan\b|\bkontrakan\b|indekos/],
  [
    "outdoor",
    /outdoor|\bmobil\b|\bhutan\b|\bkebun|\bkebon\b|\bpantai\b|\bsawah\b|\bsemak|\btaman\b|di luar rumah|\bparkiran|tempat umum|\bgubuk\b|\bsungai\b|\bcurug\b|air terjun|\bgunung\b|alam terbuka/,
  ],
  ["kamar-mandi", /kamar mandi|\btoilet\b|\bwc\b|\bmandi\b|\bbathtub|\bbathub|\bshower\b/],
  [
    "tobrut",
    /\btobrut\b|\btoge\b|toket (?:gede|besar|jumbo)|susu (?:gede|besar|jumbo)|payudara (?:besar|gede)|\bbbw\b|big tits|\bboobs\b/,
  ],
];

/**
 * Raw category values (bot messages / source data) that explicitly name one of the
 * newer themes; they win over title rules (like a known slug does).
 */
export const RAW_CATEGORY_ALIASES = {
  perselingkuhan: "selingkuh",
  "hentai eng": "hentai",
  bumil: "hamil",
  threesome: "gangbang",
  western: "barat",
  oral: "sepong",
  creampie: "crot-dalam",
  "crot dalam": "crot-dalam",
  "kamar mandi": "kamar-mandi",
  tiktok: "selebgram",
};

/**
 * Source-folder labels that are only hints (often loose): used when the title rules
 * give nothing specific, before the generic title themes.
 */
export const SOFT_RAW_CATEGORY_ALIASES = {
  stw: "tante",
  bule: "barat",
  tobrut: "tobrut",
  outdoor: "outdoor",
  artis: "selebgram",
};

/** @param {string} title @returns {string} slug or "" */
export function detectExtraCategory(title = "") {
  const t = normCategoryText(title);
  if (!t) return "";
  for (const [slug, re] of EXTRA_CATEGORY_RULES) {
    if (re.test(t)) return slug;
  }
  return "";
}

/**
 * @param {string} base category from the existing rules
 * @param {string} title
 * @returns {string}
 */
export function refineCategory(base, title = "") {
  const b = String(base || "").toLowerCase().trim();
  const t = normCategoryText(title);
  if (b === "abg" && MAHASISWI.test(t)) return "mahasiswi";
  if (b === "istri" && SELINGKUH.test(t) && !/\b(?:istri|istrinya|suami|suaminya|bini)\b/.test(t)) return "selingkuh";
  if (GENERIC_CATEGORY_SLUGS.has(b)) {
    const extra = detectExtraCategory(t);
    if (extra) return extra;
  }
  return b;
}
