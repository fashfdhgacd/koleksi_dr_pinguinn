/**
 * Lapisan konteks "logika manusia" untuk kotak "Perlu dicek" di /pemilik.
 *
 * PENTING: modul ini TIDAK mengubah keputusan. Keputusan tetap dari detector pemilik
 * (minor-detector.js, kode pemilik byte-identik): minor -> "locked", review ->
 * "review_pending", "" -> "clear". Modul ini hanya menambah PENJELASAN (reason + signals +
 * penilaian) supaya pemilik bisa cepat memutuskan apakah judul itu benar konten terlarang
 * atau cuma kata keluarga/salah tulis. Penilaian di sini tidak pernah menurunkan "minor".
 *
 * CARA CEK (penilaian)
 * 1. Istilah yang memang berarti anak (bocil, loli, 萝莉, 幼女, umur <= 15) atau pola eksplisit
 *    => "terlarang" (juga kalau disamarkan: An4k, b0cil, sm4, s m p).
 * 2. "anak/ayah/ibu/keluarga" SENDIRIAN bukan sinyal: anak tiri, anak kost, anak bos, anak
 *    magang, Ibu Anak Tiriku = genre dewasa. "Si kecil" yang disusui bukan objek seks.
 * 3. Sinyal merah berskor: SMP (+3), kelas X/XI/XII (+3), "masih sekolah" (+3), seragam +
 *    sekolah (+3), ABG + sekolah (+3), anak + sekolah/pesantren/guru (+3), "anak ***" (+3),
 *    umur 16-17 (+3), 高中/高三/校服 (+3), ujian masuk kuliah + anak (+3), kata sekolah (+2),
 *    ABG/seragam saja (+1), penyamaran disengaja (+2).
 * 4. Sinyal dewasa (-2, maks -4): kuliah/mahasiswi, kerja/bos, istri/suami, tante/ibu kost,
 *    keluarga tiri, umur >= 18, kode JAV.
 * 5. Skor >= 3 => "sinyal merah, cek videonya"; di bawah => "kemungkinan cuma kata keluarga /
 *    salah tulis judul".
 * Pemilik memvalidasi lewat thumbnail + link tonton di kotak, lalu tap Tayangkan/Sembunyiin.
 */

function norm(t = "") {
  return String(t)
    .toLowerCase()
    .replace(/[\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

import { hasAdultAgeMarker } from "./minor-lock.js";

const EXPLICIT_MINOR_PATTERNS = [
  /\b(?:anak\s+di\s+bawah\s+umur|di\s+bawah\s+umur|underage|minor(?:\s+content)?)\b/,
  /\b(?:balita|anak\s+kecil)\b/,
  /\b(?:anak\s+(?:sd|smp|sma)|murid\s+(?:sd|smp|sma)|siswa\s+(?:sd|smp|sma)|pelajar\s+(?:sd|smp|sma))\b/,
];

/** Istilah yang memang berarti anak, setara lantai keras. */
const CHILD_TERMS = /\b(?:bocil|bocah\s+sd|loli|lolicon|lolita\s+kecil)\b|幼女|小学生|初中生|萝莉/;

const SCHOOL_CTX = /\b(?:sekolah|kelas|seragam|siswi|siswa|murid|pelajar|guru|uks|pesantren|santri|osis|putih\s+abu|smk|smu|smp)\b|校服|学生/;
/** @type {Array<[RegExp, string]>} */
const ADULT_SIGNALS = [
  [/\b(?:mahasiswi|mahasiswa|kuliah|kampus)\b/, "konteks kuliah (dewasa)"],
  [/\b(?:karyawati|karyawan|kantor|atasan|bos)\b/, "konteks kerja (dewasa)"],
  [/\b(?:istri|suami|janda|hamil|menikah)\b/, "istri/suami (dewasa)"],
  [/\b(?:tante|milf|emak|ibu\s+kost?|ibu\s+rumah\s+tangga)\b/, "tante/ibu (dewasa)"],
  [/\b(?:mama|ibu|mami)\s+tiri\b|\banak\s+tiri/, "keluarga tiri (genre dewasa)"],
];

/** @type {Record<string, string>} */
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", $: "s" };

/** Baca ulang penyamaran: An4k -> anak, s m p / s.m.a -> smp / sma. */
function deobfuscate(raw = "") {
  let s = String(raw).toLowerCase();
  // token campuran huruf+angka (bukan kode JAV "abc-123" yang dipisah tanda hubung)
  s = s.replace(/[\p{L}0-9@$]+/gu, (w) => (/\p{L}/u.test(w) && /[0-9@$]/.test(w) && !/^\p{L}+\d{3,}$/u.test(w) ? w.replace(/[013457@$]/g, (c) => LEET[c]) : w));
  // huruf yang dipisah spasi/titik: "s m p", "s.m.a", "b o c i l"
  s = s.replace(/\b(?:\p{L}[\s._-]){2,}\p{L}\b/gu, (w) => w.replace(/[\s._-]/g, ""));
  return norm(s);
}

/** @param {string} t @param {string} raw */
function scoreText(t, raw) {
  const signals = [];
  let score = 0;
  const add = (/** @type {number} */ n, /** @type {string} */ s) => { score += n; signals.push(`${n > 0 ? "+" : ""}${n} ${s}`); };
  const school = SCHOOL_CTX.test(t);
  if (/\bsmp\b/.test(t)) add(3, "SMP");
  if (/\bkelas\s+(?:x|xi|xii|[1-9])\b/.test(t)) add(3, "kelas X/XI/XII atau angka kelas");
  if (/\bmasih\s+sekolah\b/.test(t)) add(3, "'masih sekolah'");
  if (/\bseragam\b/.test(t) && /\b(?:sekolah|sma|smk|smu|smp|putih\s+abu|osis)\b/.test(t)) add(3, "seragam + sekolah");
  else if (/\bseragam\b/.test(t)) add(1, "seragam (bisa seragam kerja)");
  if (/\babg\b/.test(t)) {
    if (school) add(3, "ABG + konteks sekolah");
    else add(1, "ABG (biasanya remaja dewasa)");
  }
  if (/\banak\b/.test(t) && /\b(?:sekolah|kelas|pesantren|santri|guru|uks|osis)\b/.test(t)) add(3, "'anak' + konteks sekolah/guru");
  if (/\banak\s*\*{2,}/i.test(raw)) add(3, "kata disensor (***) setelah 'anak' (bisa SMA/SD)");
  if (/高中|高三|中学|校服|学生妹/.test(raw)) add(3, "istilah sekolah Mandarin (高中/高三/校服)");
  if (/(?:高考|gaokao|ujian\s+masuk\s+kuliah|ujian\s+nasional)/i.test(raw) && /(?:儿子|\banak\b|son\b)/i.test(raw)) add(3, "ujian masuk kuliah + anak");
  if (/\b(?:sekolah|siswi|murid|pelajar)\b/.test(t) || (/\bsma\b/.test(t) && school)) add(2, "kata sekolah");
  for (const m of t.matchAll(/\b(?:umur|usia)\s+(\d{1,2})\b|\b(\d{1,2})\s*(?:thn|tahun|yo)\b/g)) {
    const n = Number(m[1] || m[2]);
    if (n >= 16 && n < 18) add(3, `umur ${n}`);
  }
  let adult = 0;
  for (const [re, label] of ADULT_SIGNALS) if (re.test(t) && adult > -4) { adult -= 2; signals.push(`-2 ${label}`); }
  for (const m of t.matchAll(/\b(?:umur|usia)\s+(\d{1,2})\b|\b(\d{1,2})\s*(?:thn|tahun|yo)\b/g)) {
    const n = Number(m[1] || m[2]);
    if (n >= 18 && adult > -4) { adult -= 2; signals.push(`-2 umur ${n} (dewasa)`); }
  }
  if (/\b[A-Z]{2,6}-\d{3,5}\b/.test(raw) && adult > -4) { adult -= 2; signals.push("-2 kode JAV (aktris dewasa)"); }
  return { score: score + adult, redScore: score, signals };
}

/** @param {string} t @param {string} raw */
function hardFloor(t, raw) {
  if (EXPLICIT_MINOR_PATTERNS.some((re) => re.test(t))) return "pola eksplisit di bawah umur (anak SD/SMP/SMA, balita, underage)";
  if (CHILD_TERMS.test(t) || /幼女|小学生|初中生|萝莉/.test(raw)) return "istilah yang berarti anak (bocil/loli/萝莉/幼女)";
  for (const m of t.matchAll(/\b(?:umur|usia)\s+(\d{1,2})\b|\b(\d{1,2})\s*(?:thn|tahun|yo)\b/g)) {
    const n = Number(m[1] || m[2]);
    if (n >= 1 && n <= 15) return `umur ${n} tahun`;
  }
  return "";
}

/**
 * Penilaian lengkap satu judul.
 * @returns {{verdict: "minor"|"review"|"clear", reason: string, signals: string[], score: number}}
 */
export function detectMinor(title = "") {
  const raw = String(title || "");
  const t = norm(raw);
  if (!t) return { verdict: "clear", reason: "Judul kosong.", signals: [], score: 0 };
  const floor = hardFloor(t, raw);
  if (floor) return { verdict: "minor", reason: `Diblokir: ${floor}.`, signals: [`lantai keras: ${floor}`], score: 99 };
  const d = deobfuscate(raw);
  if (d !== t) {
    const f2 = hardFloor(d, raw);
    if (f2) return { verdict: "minor", reason: `Diblokir: ${f2}, sengaja disamarkan (huruf/angka diganti).`, signals: [`disamarkan: "${d}"`, `lantai keras: ${f2}`], score: 99 };
  }
  const base = scoreText(t, raw);
  let { score, signals } = base;
  if (d !== t) {
    const ob = scoreText(d, raw);
    if (ob.redScore > base.redScore) {
      score = ob.score + 2;
      signals = [...ob.signals, `+2 sengaja disamarkan ("${d}")`];
    }
  }
  if (score >= 3) {
    const red = signals.filter((s) => s.startsWith("+")).map((s) => s.replace(/^\+\d+ /, ""));
    return { verdict: "review", reason: `Perlu dicek: ${red.join(", ")}. Pastikan tokohnya dewasa.`, signals, score };
  }
  const why = signals.length
    ? `Tidak diblokir: sinyal lemah atau tertutup konteks dewasa (${signals.join("; ")}).`
    : "Tidak ada sinyal anak/sekolah; kata keluarga (anak/ibu/ayah) sendirian dianggap genre dewasa.";
  return { verdict: "clear", reason: why, signals, score };
}

/**
 * Label penilaian untuk judul bersinyal lemah, sesuai sinyal yang benar-benar ada (bukan label umum).
 * @param {string} title
 */
export function weakAssessment(title = "") {
  const t = norm(String(title || ""));
  if (ownerChecked18(title)) return "ada tanda dewasa (18yo/18+)";
  if (/\b(?:anak|ayah|ibu|mama|papa|keluarga|istri|suami|adik|adek|kakak|tiri)\b/.test(t)) return "kata keluarga (bukan tanda umur), kemungkinan salah tulis judul";
  if (/\bseragam\b/.test(t)) return "cuma kata seragam (bisa seragam kerja/cosplay)";
  return "sinyal lemah, kemungkinan salah tulis judul";
}

/** Status proyek dari verdict detector pemilik. */
export function statusOf(ownerVerdict = "") {
  return ownerVerdict === "minor" ? "locked" : ownerVerdict === "review" ? "review_pending" : "clear";
}

/**
 * Penjelasan untuk kotak pemilik. `status` SELALU dari detector pemilik; `assessment` hanya saran.
 * @param {string} title
 * @param {string} ownerVerdict hasil minorContentReason() pemilik ("minor" | "review" | "")
 */
export function explainTitle(title = "", ownerVerdict = "") {
  const d = detectMinor(title);
  const status = statusOf(ownerVerdict);
  const assessment = d.verdict === "minor" ? "terlarang" : d.verdict === "review" ? "sinyal merah, cek videonya" : weakAssessment(title);
  const reason =
    status === "locked"
      ? `Terkunci oleh detector pemilik. ${d.verdict === "minor" ? d.reason : "Pola eksplisit di bawah umur."}`
      : status === "review_pending"
        ? `Ditandai detector pemilik (kata sekolah/keluarga + kata umur/anak). Penilaian konteks: ${assessment}. ${d.reason}`
        : d.reason;
  return { status, assessment, contextVerdict: d.verdict, reason, signals: d.signals, score: d.score };
}

/**
 * Isyarat sekolah tambahan (2026-10-26, keputusan pemilik): TIDAK mengunci, hanya memasukkan judul ke
 * kotak "Perlu dicek" (review_pending). Judul dengan penanda dewasa eksplisit tidak pernah ditandai.
 */
const SCHOOL_REVIEW_CUES = /** @type {Array<[RegExp, string]>} */ ([
  [/\b(?:abg|abege|masih|bocil|dedek|adek)\b[^.]{0,30}\bseragam\b/, "kata muda + seragam"],
  [/\bseragam\b[^.]{0,20}\b(?:abg|sekolah|smp|sma|smk|putih abu|pramuka)\b/, "seragam + sekolah"],
  [/\b(?:dalam|di) (?:ruang )?kelas\b/, "di/dalam kelas"],
]);
const ADULT_MARKERS =
  /\b(?:1[89]|[2-9]\d)\s*(?:yo|y o|thn|tahun|th)\b|\b(?:1[89]|[2-9]\d)\s*\+|\b[2-9]0\s*an\b|\b(?:dewasa|mahasiswi|mahasiswa|kuliah|kampus|college|university|universitas)\b/;

/**
 * @param {string} title
 * @returns {string} label isyarat ("" kalau tidak ada / ada penanda dewasa)
 */
export function schoolReviewCue(title = "") {
  const t = String(title || "").toLowerCase().replace(/\*{2,}/g, " ");
  if (!t.trim() || ADULT_MARKERS.test(t)) return "";
  for (const [re, label] of SCHOOL_REVIEW_CUES) if (re.test(t)) return label;
  return "";
}

/**
 * Pemilik (2026-10-26): judul bertanda umur 18 ("18+", "18yo", atau "18" berdiri sendiri sebagai umur)
 * sudah dicek pemilik, jadi tidak masuk antrean "Perlu dicek" dan tidak ditahan saat upload.
 * TIDAK membuka kunci: verdict "minor" / kunci minor-lock.js / HIDDEN_IDS tetap berlaku.
 * Tidak cocok dengan 1080/180/18:30/18.5/18cm/18 menit dll.
 */
const AGE18 =
  /(?:^|[^\p{L}\p{N}.,:\-])18(?:\s*\+|\s*(?:yo|y\.o\.?|thn|tahun|th)\b|(?![\p{L}\p{N}.,:]|\s*(?:cm|mm|menit|min|jam|detik|ribu|rb|juta|k|p|fps|gb|mb)\b))/iu;

/** @param {string} title */
export function ownerChecked18(title = "") {
  // Sama dengan minor-lock.js hasAdultAgeMarker (18yo/18 yo/18+/19+/20 tahun, bukan Eps/Part 18) + "18" berdiri sendiri.
  return AGE18.test(String(title || "")) || hasAdultAgeMarker(title);
}
