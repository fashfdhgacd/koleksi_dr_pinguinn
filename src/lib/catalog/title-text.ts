// Title text helpers shared by title-tags.ts and the AI Indo category (dependency-free so the
// node --test runner can load them).
import { normCategoryText } from "./title-category.js";

/** Child / school wording: blocks every age-flavoured tag (teen-18, college-18). */
export const MINOR_WORDS =
  /\b(?:sd|smp|sma|smk|mts|bocil|bocah|anak|pelajar|sekolah|siswi|siswa|seragam sekolah|abg|remaja|di ?bawah umur|loli|lolita|underage|child|kid|kids|schoolgirl)\b/;

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
 * Kept off the AI Indo landing page out of caution (they stay in AI+): wording that can imply a young
 * character ("your mom ...", "budak" = kid, classroom, private tutoring, nephew).
 */
const AI_INDO_SKIP =
  /\b(?:mamahmu|mamamu|mamahku|ibumu|mamah kamu|mama kamu|ibu kamu|budak|di kelas|les privat|keponakan)\b/;

/**
 * AI Indo (2026-11-02): an AI+ video whose own title says it is Indonesian. Additive only (the caller
 * adds "ai-indo" next to "ai-plus"); never for a title with child/school wording.
 */
export function isIndoAiTitle(title: string | undefined): boolean {
  const t = normCategoryText(stripTemplate(title || ""));
  return Boolean(t) && INDO_RE.test(t) && !MINOR_WORDS.test(t) && !AI_INDO_SKIP.test(t);
}
