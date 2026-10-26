/**
 * Minor-content title detector (owner-supplied 2026-10-26, kept verbatim).
 * "minor" = block (locked via minor-lock.js), "review" = held for the owner's manual check
 * (hidden by default, owner can Unhide), "" / "clear" = not blocked BY THIS DETECTOR ONLY:
 * the other rules (hidden-ids.js, minor-lock.js, title-guard.js) still apply.
 */
function norm(t = "") {
  return String(t)
    .toLowerCase()
    .replace(/[\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EXPLICIT_MINOR_PATTERNS = [
  /\b(?:anak\s+di\s+bawah\s+umur|di\s+bawah\s+umur|underage|minor(?:\s+content)?)\b/,
  /\b(?:balita|anak\s+kecil)\b/,
  /\b(?:anak\s+(?:sd|smp|sma)|murid\s+(?:sd|smp|sma)|siswa\s+(?:sd|smp|sma)|pelajar\s+(?:sd|smp|sma))\b/,
];

const REVIEW_PATTERNS = [
  /\b(?:sekolah|kelas|murid|siswa|siswi|pelajar|mahasiswa|kampus)\b/,
  /\b(?:anak|ayah|ibu|mama|papa|keluarga|istri|suami)\b/,
];

export function minorContentReason(title = "") {
  const t = norm(title);
  if (!t) return "";

  // 1) Jelas minor -> block
  if (EXPLICIT_MINOR_PATTERNS.some((re) => re.test(t))) {
    return "minor";
  }

  // 2) Kombinasi mencurigakan -> review, bukan block
  const hasSchoolFamilyContext = REVIEW_PATTERNS.some((re) => re.test(t));
  const hasAgeLikeWord =
    /\b(?:umur|usia|kecil|balita|anak|di bawah umur|minor)\b/.test(t);

  if (hasSchoolFamilyContext && hasAgeLikeWord) {
    return "review";
  }

  return "";
}

/** @param {string} title */
export function isMinorContentTitle(title = "") {
  return minorContentReason(title) === "minor";
}

export function reviewPriority(reason = "", title = "") {
  const normalizedReason = String(reason || "").trim().toLowerCase();
  const detectedReason = minorContentReason(title);

  if (normalizedReason === "minor" || detectedReason === "minor") return "block";
  if (normalizedReason === "review" || detectedReason === "review") return "review";

  return "clear";
}
