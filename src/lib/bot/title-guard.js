/**
 * Upload guard for new videos (Telegram bot + /pemilik paste box, both via processUploadBatch).
 * Strictest of Pornhub / xHamster rules, decided by the owner 2026-10-19:
 *
 * - uploadRejectReason(): EXPLICIT minor terms (bocil, anak kecil, SD/SMP/SMA, underage, child/kid,
 *                         preteen, loli/shota, schoolgirl, belum sunat, นักเรียน) -> NOT saved.
 * - uploadWarnReason():   school / force / sleeping / drunk words -> saved normally, the bot warns
 *                         so the owner can check and hide (too many false positives to reject).
 *
 * Whole words, case-insensitive. "guru"/"cikgu" never count. No imports: plain JS, testable with node.
 */

/** Lowercase, punctuation to spaces, single spaces (Thai kept as-is). */
function norm(text) {
  return ` ${String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** [label shown to the owner, regex on the normalized text]. First hit wins. Explicit minor terms only. */
const REJECT_RULES = [
  ["bocil", /\sbocil\w*\s/],
  ["anak kecil", /\sanak[\s-]+kecil\s/],
  ["SD/SMP/SMA", /\s(?:sd|smp|sma)\s/],
  ["di bawah umur", /\s(?:di\s*bawah\s+umur|underage|under\s+age)\s/],
  ["child/kid", /\s(?:child|children|kid|kids)\s/],
  ["preteen", /\spre\s?teens?\s/],
  ["loli/shota", /\s(?:loli|lolicon|shota|shotacon)\s/],
  ["schoolgirl", /\sschool\s?(?:girl|girls)\s/],
  ["belum sunat", /\sbelum\s+sunat\s/],
  ["นักเรียน", /นักเรียน/],
];

/** Saved normally, the owner gets a "cek dulu" warning. */
const WARN_RULES = [
  ["pesantren/santri", /\s(?:pesantren|santri|santriwati)\s/],
  ["siswi/siswa/pelajar", /\s(?:siswi|siswa|pelajar|murid)\s/],
  ["sekolah", /\ssekolah\s/],
  ["perkosa", /\s(?:di)?perkosa\w*\s/],
  ["rape", /\s(?:rape|raped|raping)\s/],
  ["dipaksa", /\s(?:di)?paksa\w*\s/],
  ["forced", /\sforced\s/],
  ["tidur", /\stidur\s/],
  ["sleeping", /\s(?:sleeping|asleep)\s/],
  ["mabuk", /\s(?:mabuk|dimabukin|dimabukkan|nilasing|lasing|drunk)\s/],
  ["pingsan", /\s(?:pingsan|unconscious)\s/],
  ["dibius", /\s(?:dibius|bius|drugged)\s/],
];

function firstHit(rules, text) {
  const t = norm(text);
  for (const [label, re] of rules) if (re.test(t)) return label;
  return "";
}

/** Label of the explicit minor term in the title, or "" when the upload may go ahead. */
export function uploadRejectReason(text = "") {
  return firstHit(REJECT_RULES, text);
}

/** Label of a school / force / sleeping / drunk term: the video is saved, the owner gets a warning. "" when none. */
export function uploadWarnReason(text = "") {
  return firstHit(WARN_RULES, text);
}
