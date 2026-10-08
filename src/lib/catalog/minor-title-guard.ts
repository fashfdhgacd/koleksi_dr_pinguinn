/**
 * Light display guard: strips wording that implies minors from titles at load time
 * (mostly machine-translated wording like "teen" → "remaja" on adult videos).
 * Only the shown title (and SEO title/search text) changes. Content that is itself
 * school/minor themed is hidden instead (see hidden-ids.js).
 * "tocil" is adult slang (small breasts), not minor wording: never stripped.
 */
const RULES: [RegExp, string][] = [
  [/\b(?:yang\s+)?masih\s+(?:remaja|sekolah|bocil|kecil|di\s*bawah\s*umur)\b/gi, ""],
  [/\b(?:anak|siswi|siswa|murid|cewek|cewe|abg)\s+(?:sma|smp|sd|sekolahan|sekolah)\b/gi, "cewek"],
  [/\b(?:seragam\s+)?(?:sma|smp)\b/gi, ""],
  [/\b(?:bocil|bocah|di\s*bawah\s*umur|under\s*-?\s*age(?:d)?|lolita|loli|teen(?:s|ager)?)\b/gi, ""],
  [/\bpelacur\s+muda\b/gi, "pelacur"],
  [/\blittle\s+(step\s?(?:sister|sis|daughter|brother|son))\b/gi, "$1"],
  [/\bremaja\b/gi, ""],
  [/\bseperti\s+pemula\b/gi, ""],
];

export function softenMinorTerms(title: string): string {
  // Underscore-joined titles ("Ngewe_Remaja_...") must match word boundaries too.
  let t = String(title || "").replace(/_+/g, " ");
  if (!t.trim()) return title;
  let changed = false;
  for (const [re, rep] of RULES) {
    const next = t.replace(re, rep);
    if (next !== t) {
      changed = true;
      t = next;
    }
  }
  if (!changed) return title;
  t = t
    .replace(/[_]+/g, " ")
    .replace(/\s+([,.!?)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—|:,]+|[\s\-–—|:,]+$/g, "")
    .trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length >= 3 ? t : "Video";
}
