/**
 * Pornhub-style multi-category tags (owner decision 2026-10-21): one video can sit in several
 * /kategori categories. Deterministic keyword rules on the title (word boundaries, Indonesian +
 * common English synonyms) on top of the video's primary category (slugOf), max MAX_TAGS.
 * Computed once per catalog build (buildIndexes) for category membership, and per watch render for
 * the chips; no DB/KV. Source-pure categories (jav, videy, bokep) only ever come from the primary
 * slug, so Jav holds only Jav and Videy only Videy; Jav/Videy videos may still join other categories.
 * teen-18 is never added by keywords; college-18 only via campus wording and never when the title
 * has any school/child word.
 */
import { EXTRA_CATEGORY_RULES, normCategoryText } from "./title-category.js";
import { MAX_TAGS as MAX_ALL_TAGS, extraTags } from "./tag-dictionary.js";
import { findCategory } from "./categories";

/** Cap of the original rules (kept so their output is unchanged); tag-dictionary.js then adds up to MAX_ALL_TAGS. */
export const MAX_TAGS = 8;
export { MAX_ALL_TAGS };

/** Child / school wording: blocks every age-flavoured tag (teen-18, college-18). */
const MINOR_WORDS =
  /\b(?:sd|smp|sma|smk|mts|bocil|bocah|anak|pelajar|sekolah|siswi|siswa|seragam sekolah|abg|remaja|di ?bawah umur|loli|lolita|underage|child|kid|kids|schoolgirl)\b/;

const extra = new Map<string, RegExp>(EXTRA_CATEGORY_RULES as [string, RegExp][]);
const mahasiswiRule = extra.get("mahasiswi");

/** Order = priority when more than MAX_TAGS match. */
const TAG_RULES: [string, RegExp][] = [
  // Not a bare "ai": JAV actresses are often named Ai (Ai Sayama).
  ["ai-plus", /buatan ai|\bai generated\b|\bdeepfake\b|\bai ?短剧|\bai (?:china|short drama|drama|video)\b/],
  // AI GAY: the #aigay upload tag or "ai gay" wording. Never a bare "gay" (not AI-made).
  ["ai-gay", /\bai ?gay\b|\bgay ai\b/],
  ["jilbab", /\b(?:jilbab|jilboob|berjilbab|hijab|hijaber|hijabers|kerudung|tudung|cadar|niqab)\b/],
  ["tante", /\b(?:tante|milf|janda|stw|mature|mamah muda|mama muda|cougar)\b/],
  ["istri", /\b(?:istri|istriku|istrinya|bini|wife|pasutri|suami istri)\b/],
  ["selingkuh", extra.get("selingkuh")!],
  ["gangbang", /\b(?:gangbang|threesome|3some|bertiga|foursome|berempat|mmf|ffm|group sex|orgy)\b/],
  ["hamil", extra.get("hamil")!],
  ["ojol", extra.get("ojol")!],
  ["barat", extra.get("barat")!],
  ["chindo", /\b(?:chindo|cindo|cina indo|chinese indo)\b/],
  ["malaysia", /\b(?:malaysia|malay|melayu|tudung)\b/],
  ["selebgram", extra.get("selebgram")!],
  ["live", /\b(?:live|livestream|live stream|bigo|mango live|siaran langsung)\b/],
  ["open-bo", /\b(?:open ?bo|psk|lc|karaoke|jablay|cewek bayaran|booking)\b/],
  ["colmek", /\b(?:colmek|coli|masturbasi|masturbate|masturbating|masturbation|fingering|dildo|vibrator)\b/],
  ["sepong", extra.get("sepong")!],
  ["doggy", /\b(?:doggy|doggystyle|doggy style|nungging)\b/],
  ["wot", extra.get("wot")!],
  ["crot-dalam", extra.get("crot-dalam")!],
  ["tobrut", extra.get("tobrut")!],
  ["kosan", extra.get("kosan")!],
  ["hotel", extra.get("hotel")!],
  ["kamar-mandi", extra.get("kamar-mandi")!],
  ["outdoor", extra.get("outdoor")!],
  ["percakapan", /\b(?:percakapan|obrolan|ngobrol|dialog|ngomong jorok|dirty talk)\b/],
  ["viral", /\b(?:viral|trending|lagi rame|heboh)\b/],
  ["amatir", /\b(?:amatir|amateur|homemade|home made|real ?couple|reallife|real life|rekam sendiri|pacar|pacarnya)\b/],
  // More everyday Indonesian wording (2026-10-22), word boundaries only.
  ["jilbab", /\b(?:ukhti|akhwat|jilbaber|kerudungan|hijaban)\b/],
  ["tobrut", /\b(?:montok|semok|bohay|toket|tetek|pentil|susu montok)\b/],
  ["colmek", /\b(?:ngocok sendiri|colok memek|mainin memek|gesek gesek)\b/],
  ["crot-dalam", /\b(?:crot dalem|keluarin dalem|hamilin)\b/],
  ["outdoor", /\b(?:di mobil|dalam mobil|semak semak|kebun|ladang|empang|pinggir jalan)\b/],
  ["percakapan", /\b(?:sambil ngobrol|ngobrol jorok|suara jelas|desahan jelas)\b/],
  ["amatir", /\b(?:mesum|rekaman|direkam|ngewe|ngentot|ngentotin|dientot|skandal|video pribadi)\b/],
];

/**
 * SEO categories added 2026-10-26 (categories.ts SEO_MIN_COUNT): additive title rules only, checked
 * after the rules above, and never on a title with child/school wording. "prank" (consent unclear),
 * "gilir" (same) and person or other-site names are deliberately not here.
 */
const SEO_TAG_RULES: [string, RegExp][] = [
  ["blunder", /\bblunder\b/],
  ["kelas-bintang", /\bkelas ?bintang\b/],
  ["tiktok", /\b(?:tiktok|tiktoker|tiktokers|tik tok)\b/],
  ["mantan", /\b(?:mantan|mantanku|mantannya)\b/],
  ["vcs", /\b(?:vcs|video call sex|video call)\b/],
  ["kompilasi", /\b(?:kompilasi|compilation)\b/],
  ["tetangga", /\b(?:tetangga|tetanggaku)\b/],
  ["kacamata", /\b(?:kacamata|kaca mata|berkacamata|glasses)\b/],
  ["kantor", /\b(?:kantor|office|karyawan|karyawati|sekretaris|rekan kerja)\b/],
  ["anal", /\b(?:anal|lubang pantat)\b/],
  ["cantik", /\b(?:cantik|cakep|geulis)\b/],
];

/** Fraction of the catalog (by real view stats) tagged Viral. */
const POPULAR_SHARE = 0.1;
const popularMemo = new WeakMap<object, Set<string>>();
/**
 * Top ~10% most-viewed ids (stored view stats), computed once per catalog build (memo on the items
 * array) and shared by category membership and watch chips.
 */
export function popularIds(items: { id: string; views?: unknown }[]): Set<string> {
  let set = popularMemo.get(items);
  if (set) return set;
  const withViews = items.filter((it) => typeof it.views === "number" && (it.views as number) > 0);
  const sorted = [...withViews].sort((a, b) => (b.views as number) - (a.views as number));
  set = new Set(sorted.slice(0, Math.floor(sorted.length * POPULAR_SHARE)).map((it) => it.id));
  popularMemo.set(items, set);
  return set;
}

export type TagOptions = {
  /** IndoAV / UserBokep / Putarin: an "Indo" title from these is a real amateur Indonesian video. */
  indoSource?: boolean;
  /** In the top POPULAR_SHARE by real views. */
  popular?: boolean;
  /** embed / source / direct URLs, for host-based tags (tag-dictionary.js SOURCE_TAG_RULES). */
  sourceText?: string;
  /** Tags the Telegram bot stored at ingest (item.tags); only real category slugs are used. */
  storedTags?: string[];
};

/** Auto-generated / branding text that says nothing about the video (bot and import templates). */
function stripTemplate(title: string): string {
  return title
    .replace(/video viral videy indo terbaru\s*\d*/gi, " ")
    .replace(/koleksi\s*dr\.?\s*pinguin(?:\s*bokep)?/gi, " ")
    .replace(/koleksidrpinguin(?:\.com)?/gi, " ")
    .replace(/m\.s\.b\.?/gi, " ");
}

/** Words the Videy title templates are built from; removed before tagging Videy titles. */
function stripVideyTemplate(title: string): string {
  return title.replace(
    /\b(?:videy|viral|terbaru|terbaik|indo|indonesia|video|vidio|bokep|link|hari ini|lagi rame|rame|trending|heboh|update|full|new|baru|\d+)\b/gi,
    " ",
  );
}

/**
 * @param title video title
 * @param primary the video's primary category slug (slugOf); always first.
 */
export function titleTags(title: string | undefined, primary: string, opts: TagOptions = {}): string[] {
  // Gay videos (owner decision 2026-10-27) sit only in AI GAY: no straight-category tags.
  if (primary === "ai-gay") return ["ai-gay"];
  const out: string[] = primary ? [primary] : [];
  // Videy titles are mostly generated SEO templates ("Videy Viral Terbaru 484"): tag only real words.
  const raw = stripTemplate(title || "");
  const t = normCategoryText(primary === "videy" ? stripVideyTemplate(raw) : raw);
  if (!t) return opts.popular && !out.includes("viral") ? [...out, "viral"] : out;
  const minor = MINOR_WORDS.test(t);
  if (!minor && mahasiswiRule && mahasiswiRule.test(t) && !out.includes("college-18")) out.push("college-18");
  if (opts.popular && !out.includes("viral")) out.push("viral");
  for (const [slug, re] of TAG_RULES) {
    if (out.length >= MAX_TAGS) break;
    if (!out.includes(slug) && re.test(t)) out.push(slug);
  }
  if (!minor) {
    for (const [slug, re] of SEO_TAG_RULES) {
      if (out.length >= MAX_TAGS) break;
      if (!out.includes(slug) && re.test(t)) out.push(slug);
    }
  }
  // Source-true: IndoAV / UserBokep / Putarin videos titled "Indo ..." are Indonesian amateur clips.
  if (opts.indoSource && out.length < MAX_TAGS && !out.includes("amatir") && /\b(?:indo|indonesia|bokep indo)\b/.test(t)) {
    out.push("amatir");
  }
  const base = out.slice(0, MAX_TAGS);
  // Additive (2026-10-27): shared dictionary + host + stored bot tags, up to MAX_ALL_TAGS.
  const all = base.concat(
    extraTags(t, base, { sourceText: opts.sourceText, storedTags: opts.storedTags, allowed: (s: string) => findCategory(s)?.slug === s }),
  );
  // JAV and hentai are never listed under Amatir as an extra tag (their main category is unchanged).
  return primary === "jav" || primary === "hentai" ? all.filter((s) => s !== "amatir") : all;
}

/** Tag options for a catalog item (source flags + popularity). */
export function tagOptions(
  item: { id: string; embed?: string; source?: string; direct?: string; tags?: unknown },
  popular: Set<string>,
): TagOptions {
  const blob = `${item.embed || ""} ${item.source || ""} ${item.direct || ""}`;
  const storedTags = Array.isArray(item.tags) ? item.tags.filter((x): x is string => typeof x === "string") : [];
  return { indoSource: /indoav|userbokep|putarin|puterin/i.test(blob), popular: popular.has(item.id), sourceText: blob, storedTags };
}
