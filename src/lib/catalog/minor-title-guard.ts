/**
 * Display guard: strips wording that ad networks / big tube sites (Pornhub, xHamster, TrafficStars
 * publisher rules) do not allow in a visible title, at load time. Only the shown title changes (card,
 * H1, <title>, og:title, JSON-LD, sitemap and search text all use it); the stored data stays as is,
 * and nothing is hidden by this file (hidden-ids.js decides that separately).
 *
 * Cleaned (owner decision 2026-10-19/20, big-tube standard):
 *  - minor / school wording: ABG -> "Cewek", dedek/bocil/remaja/pelajar/siswi/student/teen/
 *    schoolgirl/seragam sekolah, CJK 学生 师生 校园 萝莉 未成年 少女 JK
 *  - non-consent: diperkosa (also "Diperk0sa"), rape, paksa/dipaksa/forced, 强奸 迷奸
 *  - asleep / drunk / drugged: lagi tidur, ketiduran, pingsan, mabuk/mabok, obat tidur/perangsang,
 *    dikasih obat, asleep/drunk/drugged, 睡 醉 下药 ("bangun tidur" / "kamar tidur" stay)
 *  - blood incest: kandung, sedarah, "adik/kakak/mama sendiri", incest, 乱伦, 女儿/妹妹
 *  - urination: pipis / kencing
 *  - the old "Collection Dr. Anjing Bokep, S. M. Sc." suffix -> " - koleksidrpinguin.com"
 * Kept on purpose: step-family words (tiri, step-, ipar, mertua, paman, keponakan, 继母, 岳母),
 * muda/young, tante, mahasiswi, tocil (adult slang, small breasts).
 * When too little is left, the title becomes a neutral "Video Bokep Indo Terbaru" (+ category).
 */
const SCHOOL_RE = /\b(?:sma|smp|smk|sd|sekolah\w*|pelajar|sisw[ai]|murid|seragam\s+sekolah|school\s*girls?|students?)\b|学生|师生|校园|校服/i;

const RULES: [RegExp, string][] = [
  // Old brand suffix.
  [/\s*[-–—|]?\s*Collection\s+Dr\.?\s*Anjing\s+Bokep,?\s*S\.?\s*M\.?\s*Sc\.?/gi, " - koleksidrpinguin.com"],
  // Minor / school.
  [/\b(?:yang\s+)?masih\s+(?:remaja|sekolah|bocil|kecil|di\s*bawah\s*umur)\b/gi, ""],
  [/\b(?:anak|siswi|siswa|murid|cewek|cewe|abg)\s+(?:sma|smp|sd|sekolahan|sekolah)\b/gi, "cewek"],
  [/\b(?:seragam\s+)?(?:sma|smp)\b/gi, ""],
  [/\bseragam\s+sekolah(?:an)?\b/gi, "seragam"],
  [/\b(?:bocil|bocah|di\s*bawah\s*umur|under\s*-?\s*age(?:d)?|lolita|loli|teen(?:s|ager)?|school\s*girls?|students?|pelajar|sisw[ai]|murid|sekolah(?:an)?)\b/gi, ""],
  [/\b(?:si\s+)?dedek\b/gi, "Cewek"],
  [/\b(cewek|cewe|cwe|gadis)\s+abg\b/gi, "$1"],
  [/\babg\b/gi, "Cewek"],
  [/\bpelacur\s+muda\b/gi, "pelacur"],
  [/\blittle\s+(step\s?(?:sister|sis|daughter|brother|son))\b/gi, "$1"],
  [/\bremaja\b/gi, ""],
  [/\bseperti\s+pemula\b/gi, ""],
  // Drugged (before "tidur", so "obat tidur" goes as a whole).
  [/\b(?:di\s*kasih|dikasih|kasih|dicekokin|cekokin|di\s*jadiin|dijadiin|minum)\s+obat(?:\s+(?:tidur|perangsang|sange|penenang|penennang|bius))?\b/gi, ""],
  [/\bobat\s+(?:tidur|perangsang|sange|penenang|penennang|bius)\b/gi, ""],
  [/\b(?:di)?bius\b|\bdrugged\b/gi, ""],
  // Non-consent.
  [/\b(?:di|ter)?perk[o0]sa(?:in)?\b|\bpemerk[o0]sa(?:an)?\b|\brap(?:e|ed|es|ing)\b/gi, ""],
  [/\b(?:di|ter)?paksa(?:in)?\b|\bmaksa(?:in)?\b|\bforc(?:ed|e)\b/gi, ""],
  // Asleep / drunk. "bangun tidur", "kamar tidur", "sebelum tidur" stay.
  [/\b(?:(?:pas|saat|waktu|padahal|yang)\s+)?(?:lagi|lg|pas|sedang|yang|saat|waktu|lagi\s+asik)\s+tidur(?:\s+pulas)?\b/gi, ""],
  [/\b(?:ke|ter)tidur(?:an)?(?:\s+pulas)?\b/gi, ""],
  [/\bpingsan\b|\b(?:asleep|sleeping|unconscious)\b/gi, ""],
  [/\b(?:abis|habis|lagi|sambil|akibat|karena|di\s*buat|dibuat|sampai|sampe|yang)?\s*\b(?:mabuk|mabok|teler|drunk)\b/gi, ""],
  // Blood incest (step-family words stay).
  [/\b(?:mama|ibu|bunda|mamah)\s+(?:nya\s+)?sendiri\b/gi, "Tante"],
  [/\b(?:adik|adek|kakak|kaka)\s*(?:nya\s+)?(?:kandung|sendiri)\b/gi, "Cewek"],
  [/\b(?:anak|ayah|bapak|papa)\s+(?:nya\s+)?(?:kandung|sendiri)\b/gi, ""],
  [/\b(?:kandung|sedarah|incest)\b/gi, ""],
  // Urination.
  [/\b(?:ter)?kencing(?:in)?\b|\bpipis\b|\bpee\b|\burinat\w*\b/gi, ""],
  // CJK.
  [/学生|师生|校园|校服|女子校生|萝莉|蘿莉|未成年|少女|乱伦|亂倫|强奸|強姦|迷奸|下药|下藥|女儿|女兒|妹妹|睡|醉/g, ""],
  [/(?<![A-Za-z0-9])JK(?![A-Za-z0-9])/g, ""],
];

/** Words that cannot end a title after a cut ("… Pas", "… Yang"). */
const DANGLING = /\s+(?:pas|saat|waktu|yang|lagi|lg|sama|dan|di|sambil|abis|habis|karena|akibat|padahal|malah|oleh|sampai|sampe|biar|mau|ama|by|with|and|the|of)$/i;
const BRAND_TAIL = /\s*[-–—|]\s*koleksidrpinguin\.com\s*$/i;
const STOP = new Set(["bokep", "video", "indo", "koleksidrpinguin", "com", "the", "and", "di", "yang", "sama", "dan", "a", "片"]);

function tidy(s: string): string {
  let t = s
    .replace(/[_]+/g, " ")
    .replace(/\s+([,.!?)])/g, "$1")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\b(cewek|cewe)\s+(?:cewek|cewe)\b/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  for (let i = 0; i < 4; i++) {
    const next = t
      .replace(/^[\s\-–—|:,.]+|[\s\-–—|:,]+$/g, "")
      .replace(DANGLING, "")
      .replace(/^(?:yang|dan|di|sama|pas|lagi)\s+/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

function meaningfulWords(s: string): number {
  const latin = s
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\u024f]+/)
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w) && !STOP.has(w)).length;
  const cjk = (s.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) || []).length;
  return latin + Math.floor(cjk / 2);
}

/**
 * Display title for one item. `categoryLabel` is only used for the neutral fallback title.
 * Unchanged titles are returned as given (same string).
 */
export function softenMinorTerms(title: string, categoryLabel?: string): string {
  // Underscore-joined titles ("Ngewe_Remaja_...") must match word boundaries too.
  let t = String(title || "").replace(/_+/g, " ");
  if (!t.trim()) return title;
  const hadSchool = SCHOOL_RE.test(t);
  let changed = false;
  for (const [re, rep] of RULES) {
    const next = t.replace(re, rep);
    if (next !== t) {
      changed = true;
      t = next;
    }
  }
  // "18yo" / "18 tahun" next to school wording reads as a minor; alone it stays.
  if (hadSchool) {
    const next = t.replace(/\b18\s*(?:yo|y\.o\.?|tahun|thn)\b|\bberusia\s+18\s+tahun\b/gi, "");
    if (next !== t) {
      changed = true;
      t = next;
    }
  }
  if (!changed) return title;
  // Keep the brand tail apart so it never counts as content or gets cut as dangling.
  const brand = BRAND_TAIL.test(t);
  let body = tidy(t.replace(BRAND_TAIL, ""));
  if (meaningfulWords(body) < 3) {
    const label = String(categoryLabel || "").trim();
    body = label && !/^(?:lainnya|video)$/i.test(label) ? `Video Bokep Indo Terbaru ${label}` : "Video Bokep Indo Terbaru";
  } else {
    body = body.charAt(0).toUpperCase() + body.slice(1);
  }
  return brand ? `${body} - koleksidrpinguin.com` : body;
}
