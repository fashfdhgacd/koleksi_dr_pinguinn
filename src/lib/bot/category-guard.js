// AI GAY guard for uploads (owner report 2026-11-03: a whole IndoAV/UserBokep batch of straight
// videos landed in /kategori/ai-gay). A message-level AI GAY signal ("kategori: ai gay", #aigay,
// "BoyFriendTV" anywhere in the text, or the /pemilik "AI GAY" select) used to be applied to every
// link in the batch. Now it sticks only to a video whose own title carries a gay cue, or to a
// single-link message (one deliberate upload). Everything else falls back to title detection.

/** Gay cues in a title. Word-bounded so "gaya" (style, e.g. "gaya WOT") never counts. */
export const GAY_CUE_RE =
  /\bgay\b|\bgays\b|#ai[-_]?gay\b|\bai[-_ ]?gay\b|boy\s*friend\s*tv|\bg\.\s*y\.\s*b\b|\bgyb\b|\btwinks?\b|\bhomo(?:seksual)?\b|\bsesama\s+(?:pria|cowok|cowo|laki)\b|\bcowok\s+(?:sama|x)\s+cowok\b|\bboys?\s*love\b/i;

export function hasGayCue(text = "") {
  return GAY_CUE_RE.test(String(text || ""));
}

/**
 * The category a video should take from the message. Returns "" when an AI GAY message category
 * must not apply to this video (multi-link batch and no gay cue in its own title).
 */
/**
 * @param {unknown} given
 * @param {{ title?: string, batchSize?: number }} [opts]
 */
export function guardGivenCategory(given, { title = "", batchSize = 1 } = {}) {
  const g = String(given || "")
    .toLowerCase()
    .trim();
  if (g !== "ai-gay" && g !== "ai gay" && g !== "aigay") return g;
  if (hasGayCue(title)) return "ai-gay";
  return batchSize <= 1 ? "ai-gay" : "";
}
