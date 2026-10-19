/**
 * Upload guard for new videos (Telegram bot + /pemilik paste box, both via processUploadBatch).
 * Strictest of Pornhub / xHamster rules, decided by the owner 2026-10-19:
 *
 * - uploadRejectReason(): EXPLICIT minor terms (bocil, anak kecil, SD/SMP/SMA, underage, child/kid,
 *                         preteen, loli/shota, schoolgirl, belum sunat, นักเรียน) -> NOT saved.
 * - uploadWarnReason():   school / force / sleeping / drunk / drugged / blood-incest / urination
 *                         words, Indonesian, English and Chinese -> saved normally, the bot warns
 *                         so the owner can check (too many false positives to reject). The shown
 *                         title is cleaned automatically by src/lib/catalog/minor-title-guard.ts.
 *
 * No soft warning for category "jav" or a JAV product code in the title (scripted studio JAV); the reject applies to every category.
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
  ["obat tidur/perangsang", /\s(?:obat\s+(?:tidur|perangsang|sange|bius)|dikasih\s+obat|di\s+kasih\s+obat)\s/],
  ["kandung/sedarah", /\s(?:kandung|sedarah|incest)\s/],
  ["kencing/pipis", /\s(?:kencing|kencingin|pipis)\s/],
  ["dedek/remaja", /\s(?:dedek|remaja|teen|teens|student|students)\s/],
  // CJK: no word boundaries (norm() keeps Han/Kana as letters), so plain substring checks.
  ["学生/校园 (sekolah)", /学生|师生|校园|校服|女子校生|女高|初中|高中/],
  ["萝莉/未成年 (di bawah umur)", /萝莉|蘿莉|未成年|幼女|少女/],
  ["强奸/迷奸 (dipaksa)", /强奸|強姦|迷奸|强迫/],
  ["下药/睡/醉 (nggak sadar)", /下药|下藥|睡|醉/],
  ["乱伦 (inses)", /乱伦|亂倫/],
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
/**
 * JAV product code in the raw title (case-sensitive, hyphen required so words/years never match):
 * "SSIS-123", "IPX-456", "FC2-PPV-1234567", "FC2PPV-1234567". "HOT51", "FC2689", "2023" do not match.
 * Used ONLY to skip the soft warning; category assignment is unchanged.
 */
const JAV_CODE_RE = /(?:^|[^A-Za-z0-9])(?:FC2-?PPV-?\d{5,8}|[A-Z]{2,6}-\d{2,5})(?![A-Za-z0-9])/;

export function hasJavCode(text = "") {
  return JAV_CODE_RE.test(String(text ?? ""));
}

export function uploadWarnReason(text = "", category = "") {
  // Jav = professional scripted studio videos: no soft warning (the hard reject above still applies).
  if (String(category || "").trim().toLowerCase() === "jav" || hasJavCode(text)) return "";
  return firstHit(WARN_RULES, text);
}
