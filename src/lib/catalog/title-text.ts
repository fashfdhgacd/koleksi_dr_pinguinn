// Title text helpers shared by title-tags.ts and the AI Indo category (plain .js imports only so
// the node --test runner can load them).
import { normCategoryText } from "./title-category.js";
import { uploadModeration } from "./moderation.js";
import { titleHold } from "../bot/title-hold.js";

/**
 * Child / school wording: blocks every age-flavoured tag (teen-18, college-18). Tags only; it never
 * hides a video. Bare "anak" is not here (owner rule 2026-11-02: "anak kos", "anak tiri" are adult
 * genre words); "anak sd/smp/sma/kecil" still hit through the grade words / "bocah".
 */
export const MINOR_WORDS =
  /\b(?:sd|smp|sma|smk|mts|bocil|bocah|anak kecil|pelajar|sekolah|siswi|siswa|seragam sekolah|abg|remaja|di ?bawah umur|loli|lolita|underage|child|kid|kids|schoolgirl)\b/;

/** Auto-generated / branding text that says nothing about the video (bot and import templates). */
export function stripTemplate(title: string): string {
  return title
    .replace(/video viral videy indo terbaru\s*\d*/gi, " ")
    .replace(/koleksi\s*dr\.?\s*pinguin(?:\s*bokep)?/gi, " ")
    .replace(/koleksidrpinguin(?:\.com)?/gi, " ")
    .replace(/m\.s\.b\.?/gi, " ");
}

/** Indonesian wording in a title (template/brand text removed): "indo", "indonesia", "bokep indo". */
const INDO_RE = /\b(?:indo|indonesia|indonesian)\b/;
/**
 * AI Indo (2026-11-02): an AI+ video whose own title says it is Indonesian. Additive only (the caller
 * adds "ai-indo" next to "ai-plus"). Owner rule 2026-11-02: AI titles are often bad translations of
 * adult content, so one translated word ("budak", "di kelas", "mamahmu", "keponakan") is not a
 * reason to leave a video out. Same judgement as uploads (catalog/moderation.js): left out only when
 * that check would hide/hold it (explicit minor signal, school grade, age unclear such as bare "ABG").
 */
export function isIndoAiTitle(title: string | undefined): boolean {
  const t = normCategoryText(stripTemplate(title || ""));
  if (!t || !INDO_RE.test(t)) return false;
  return !uploadModeration(title || "").hide && !titleHold(title || "");
}
