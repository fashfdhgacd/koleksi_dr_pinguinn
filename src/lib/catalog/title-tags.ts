/**
 * Pornhub-style multi-category tags (owner decision 2026-10-21): one video can sit in several
 * /kategori categories. Deterministic keyword rules on the title (word boundaries, Indonesian +
 * common English synonyms) on top of the video's primary category (slugOf), max MAX_TAGS.
 * Computed once per catalog build (buildIndexes) for category membership, and per watch render for
 * the chips; no DB/KV. Source-only categories (videy, bokep) only ever come from the primary slug.
 * teen-18 is never added by keywords; college-18 only via campus wording and never when the title
 * has any school/child word.
 */
import { EXTRA_CATEGORY_RULES, normCategoryText } from "./title-category.js";

export const MAX_TAGS = 8;

/** Child / school wording: blocks every age-flavoured tag (teen-18, college-18). */
const MINOR_WORDS =
  /\b(?:sd|smp|sma|smk|mts|bocil|bocah|anak|pelajar|sekolah|siswi|siswa|seragam sekolah|abg|remaja|di ?bawah umur|loli|lolita|underage|child|kid|kids|schoolgirl)\b/;

const extra = new Map<string, RegExp>(EXTRA_CATEGORY_RULES as [string, RegExp][]);
const mahasiswiRule = extra.get("mahasiswi");

/** Order = priority when more than MAX_TAGS match. */
const TAG_RULES: [string, RegExp][] = [
  // Not a bare "ai": JAV actresses are often named Ai (Ai Sayama).
  ["ai-plus", /buatan ai|\bai generated\b|\bdeepfake\b|\bai ?短剧|\bai (?:china|short drama|drama|video)\b/],
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
];

/** Auto-generated / branding text that says nothing about the video (bot and import templates). */
function stripTemplate(title: string): string {
  return title
    .replace(/video viral videy indo terbaru\s*\d*/gi, " ")
    .replace(/koleksi\s*dr\.?\s*pinguin(?:\s*bokep)?/gi, " ")
    .replace(/koleksidrpinguin(?:\.com)?/gi, " ")
    .replace(/m\.s\.b\.?/gi, " ");
}

/**
 * @param title video title
 * @param primary the video's primary category slug (slugOf); always first.
 */
export function titleTags(title: string | undefined, primary: string): string[] {
  const out: string[] = primary ? [primary] : [];
  // Videy titles are generated SEO templates ("Videy Viral Terbaru 484"), not about the video.
  if (primary === "videy") return out;
  // Owner rule: Jav (Putarin and JAV-coded titles) lives ONLY in Jav, never in other categories.
  if (primary === "jav") return out;
  const t = normCategoryText(stripTemplate(title || ""));
  if (!t) return out;
  if (extra.get("jav")!.test(t)) return ["jav"];
  const minor = MINOR_WORDS.test(t);
  if (!minor && mahasiswiRule && mahasiswiRule.test(t) && !out.includes("college-18")) out.push("college-18");
  for (const [slug, re] of TAG_RULES) {
    if (out.length >= MAX_TAGS) break;
    if (!out.includes(slug) && re.test(t)) out.push(slug);
  }
  return out.slice(0, MAX_TAGS);
}
