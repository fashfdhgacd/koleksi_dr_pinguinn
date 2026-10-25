function norm(t = "") {
  return String(t)
    .toLowerCase()
    .replace(/[\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EXPLICIT_MINOR_PATTERNS = [
  /\bbocil\b/,
  /\bbalita\b/,
  /\b(?:anak\s+kecil|anak kecil)\b/,
  /\bunderage\b/,
  /\bdi bawah umur\b/,
  /\bminor\b/,
  /\banak\s+sd\b/,
  /\banak\s+sekolah\s+dasar\b/,
  /\banak\s+smp\b/,
  /\banak\s+sma\s+kelas\s+[123]\b/,
  /\banak\s+sma\b.*\bkelas\s+[123]\b/,
  /\b(?:sma|smp|sd)\b.*\b(?:bocil|balita|anak kecil|underage|di bawah umur|minor)\b/
];

const GENERIC_SCHOOL_HINTS = /\b(sekolah|murid|siswi|siswa|kelas|pelajar|guru|mahasiswa|kampus|sma|smp|sd)\b/;
const FAMILY_HINTS = /\b(anak|ayah|ibu|mama|papa|istri|suami|keluarga|anaknya)\b/;

export function minorContentReason(title = "") {
  const t = norm(title);
  if (!t) return "";

  if (EXPLICIT_MINOR_PATTERNS.some((re) => re.test(t))) {
    return "minor";
  }

  if (GENERIC_SCHOOL_HINTS.test(t) || FAMILY_HINTS.test(t)) {
    return "";
  }

  return "";
}

/** @param {string} title */
export function isMinorContentTitle(title = "") {
  return minorContentReason(title) !== "";
}

export function reviewPriority(reason = "", title = "") {
  const normalizedReason = String(reason || "").trim().toLowerCase();
  const hasMinorReason = minorContentReason(title);
  if (normalizedReason === "minor" || hasMinorReason) return "block";
  if (["school", "family", "generic"].includes(normalizedReason)) return "review";
  return "clear";
}
