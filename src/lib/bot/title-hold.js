/**
 * Upload-time title check for school / minor-implying words (owner request 2026-10-26, t974/t975).
 *
 * The owner is not fluent in English, so a title like "Senior Year Love Story · Episode 1" slipped
 * through. titleHold() finds such a word, explains it in Indonesian and builds 2-3 safe adult title
 * suggestions. The bot does NOT publish the upload: it is stored as an editable hidden draft
 * (hidden_reason HOLD_REASON). The owner fixes the title in /pemilik (Perlu dicek -> Edit ->
 * Tayangkan) or resends the link with a new title; the resend publishes the same draft.
 *
 * NEW UPLOADS ONLY. Nothing here is ever run over live videos (owner rule: never re-flag live ones).
 * The hard reject list in title-guard.js (bocil, SD/SMP/SMA, loli, schoolgirl, ...) still wins:
 * those are not stored at all; explainTerm() gives their meaning for the bot reply.
 * Whole words / phrases only, so "senior" alone, "kelas bintang", "class" never count.
 * No imports: plain JS, tested with node (scripts/test-title-hold.mjs).
 */

export const HOLD_REASON = "title-rename";

function norm(text) {
  return ` ${String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/**
 * [label, regex on norm(), meaning in Indonesian, adult replacements for the matched words].
 * Longer phrases first; first hit wins.
 */
const HOLD_RULES = [
  ["senior year", /\ssenior\s+years?\s/, "tahun terakhir SMA (kelas 3 SMA)", ["Senior Kantor", "Kakak Tingkat Kuliah"]],
  ["high school", /\shigh\s?schools?\s/, "SMA (sekolah menengah atas)", ["College", "Kampus"]],
  ["junior high", /\sjunior\s+high\s/, "SMP", ["Kampus", "Kantor"]],
  ["middle school", /\smiddle\s+schools?\s/, "SMP", ["Kampus", "Kantor"]],
  ["elementary school", /\s(?:elementary|primary|grade)\s+schools?\s/, "SD", ["Kampus", "Kantor"]],
  ["school uniform", /\sschool\s+uniforms?\s/, "seragam sekolah", ["Seragam Kantor", "Seragam Perawat"]],
  ["seragam sekolah", /\sseragam\s+(?:sekolah|sma|smp|sd|putih\s+abu(?:\s+abu)?|putih\s+biru|pramuka)\s/, "seragam anak sekolah", ["Seragam Kantor", "Seragam Perawat"]],
  ["schoolboy", /\sschool\s?boys?\s/, "anak laki-laki sekolah", ["Mahasiswa", "Cowok Kantoran"]],
  ["freshman", /\sfreshm[ae]n\s/, "murid/mahasiswa tahun pertama (sering dipakai buat kelas 1 SMA)", ["Mahasiswi Baru", "Karyawan Baru"]],
  ["sophomore", /\ssophomores?\s/, "murid tahun kedua (sering dipakai buat kelas 2 SMA)", ["Mahasiswi", "Karyawan"]],
  ["teenager", /\s(?:teen|teens|teenager|teenagers|teenage)\s/, "remaja, umur belasan (13-19 tahun)", ["Dewasa", "Cewek 20an"]],
  ["kelas 10/11/12", /\skelas\s+(?:10|11|12|xi|xii)\s/, "kelas di sekolah (SMA/SMP)", ["Kantor", "Kampus"]],
  ["student", /\s(?:students?)\s/, "pelajar/murid", ["Mahasiswi", "Karyawan"]],
  ["school", /\s(?:school|schools|skool)\s/, "sekolah", ["Kampus", "Kantor"]],
  ["sekolah", /\s(?:sekolah|sekolahan)\s/, "tempat anak sekolah", ["Kampus", "Kantor"]],
  ["siswi/siswa", /\s(?:siswi|siswa|murid|pelajar)\s/, "anak sekolah", ["Mahasiswi", "Karyawati"]],
  ["abg", /\s(?:abg|a\s?b\s?g)\s/, "anak baru gede, remaja belasan tahun", ["Cewek Dewasa", "Mahasiswi"]],
];

/** Adult context that makes "student" fine ("college student", "mahasiswa"). */
const ADULT_STUDENT = /\s(?:college|university|uni|kuliah|kampus|mahasiswa|mahasiswi|grad|graduate|phd)\s+students?\s/;

/** Meanings for the hard-reject labels of title-guard.js (shown in the bot reply). */
const REJECT_MEANING = {
  bocil: "bocah cilik, anak kecil",
  "anak kecil": "anak kecil",
  "SD/SMP/SMA": "anak sekolah (SD/SMP/SMA)",
  "di bawah umur": "belum 18 tahun",
  "child/kid": "anak-anak",
  preteen: "anak umur 10-12 tahun",
  "loli/shota": "istilah buat tokoh anak kecil",
  schoolgirl: "cewek anak sekolah",
  "belum sunat": "anak laki-laki yang masih kecil",
  นักเรียน: "pelajar (bahasa Thailand)",
};

export function explainTerm(label) {
  const r = HOLD_RULES.find((x) => x[0] === label);
  return r ? r[2] : REJECT_MEANING[label] || "";
}

function tidy(s) {
  return String(s)
    .replace(/\s*[·|]\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–:]+|[\s\-–:]+$/g, "")
    .trim();
}

/** "Episode 1" / "Ep 2" / "Part 3" kept from the original title. */
function episodeTail(title) {
  const m = String(title).match(/\b(?:episode|eps?|part|bagian)\.?\s*\d+\b/i);
  return m ? m[0].replace(/^ep?s?\.?\s*(\d)/i, "Episode $1") : "";
}

/** Raw-title regex for the matched words, so the suggestion keeps the rest of the title as typed. */
function rawRegex(label) {
  const map = {
    "senior year": /\bsenior\s+years?\b/gi,
    "high school": /\bhigh\s?schools?\b/gi,
    "junior high": /\bjunior\s+high(?:\s+school)?\b/gi,
    "middle school": /\bmiddle\s+schools?\b/gi,
    "elementary school": /\b(?:elementary|primary|grade)\s+schools?\b/gi,
    "school uniform": /\bschool\s+uniforms?\b/gi,
    "seragam sekolah": /\bseragam\s+(?:sekolah|sma|smp|sd|putih[\s-]+abu(?:[\s-]+abu)?|putih[\s-]+biru|pramuka)\b/gi,
    schoolboy: /\bschool\s?boys?\b/gi,
    freshman: /\bfreshm[ae]n\b/gi,
    sophomore: /\bsophomores?\b/gi,
    teenager: /\b(?:teen|teens|teenager|teenagers|teenage)\b/gi,
    "kelas 10/11/12": /\bkelas\s+(?:10|11|12|xi|xii)\b/gi,
    student: /\bstudents?\b/gi,
    school: /\b(?:school|schools|skool)\b/gi,
    sekolah: /\b(?:sekolah|sekolahan)\b/gi,
    "siswi/siswa": /\b(?:siswi|siswa|murid|pelajar)\b/gi,
    abg: /\ba\.?\s?b\.?\s?g\b/gi,
  };
  return map[label] || null;
}

/**
 * Hold check for a NEW upload title. Returns null when the title is fine, else
 * { term, meaning, suggestions } (suggestions are 2-3 titles that pass this check themselves).
 * `extraOk(title)` lets the caller also run the hard reject list on the suggestions.
 */
export function titleHold(title = "", extraOk = () => true) {
  const t = norm(title);
  let hit = null;
  for (const rule of HOLD_RULES) {
    if (!rule[1].test(t)) continue;
    if (rule[0] === "student" && ADULT_STUDENT.test(t) && !/\s(?:high|middle|school)\s/.test(t)) continue;
    hit = rule;
    break;
  }
  if (!hit) return null;
  const [term, , meaning, swaps] = hit;
  return { term, meaning, suggestions: suggestTitles(title, term, swaps, extraOk) };
}

function suggestTitles(title, term, swaps, extraOk) {
  const re = rawRegex(term);
  const raw = tidy(String(title).replace(/\s*-\s*koleksidrpinguin\.com\s*$/i, ""));
  const ep = episodeTail(raw);
  const out = [];
  const push = (s) => {
    const v = tidy(s);
    if (v && !out.includes(v) && !titleHold(v) && extraOk(v)) out.push(v);
  };
  for (const sw of swaps) push(re ? raw.replace(re, sw) : `${sw} ${raw}`);
  // Indonesian fallback built from the episode number, e.g. "Kisah Cinta Mahasiswa Episode 1".
  push(`Kisah Cinta ${/kantor|karyaw/i.test(swaps.join(" ")) ? "Kantor" : "Mahasiswa"}${ep ? ` ${ep}` : ""}`);
  push(`Kisah Cinta Dewasa${ep ? ` ${ep}` : ""}`);
  return out.slice(0, 3);
}

/** Casual Indonesian bot reply lines for a held (or rejected) upload. */
export function holdReplyLines(id, hold, { stored = true } = {}) {
  const lines = [
    `⛔ ${id}: Ditahan, judul perlu diganti. Ada kata "${hold.term}"${hold.meaning ? ` = ${hold.meaning}` : ""}, jadi kebaca kayak anak sekolah/di bawah umur.`,
  ];
  if (hold.suggestions?.length) {
    lines.push("💡 Saran judul aman (dewasa):");
    hold.suggestions.forEach((s, i) => lines.push(`   ${i + 1}. ${s}`));
  }
  lines.push(
    stored
      ? "✏️ Benerin judulnya di /pemilik (Perlu dicek → Edit → Tayangkan), atau kirim ulang link-nya pakai judul baru. Video ini belum tayang."
      : "✏️ Kirim ulang link-nya pakai judul baru. Kalau isinya memang anak sekolah/di bawah umur, jangan diupload.",
  );
  return lines;
}

/** Normalized source key (same rule as github.js F()): file code from the embed/direct URL. */
export function sourceKey(rec) {
  const e = String(rec?.embed || rec?.direct || rec?.video_url || "").toLowerCase().trim();
  const m = e.match(/\/(?:e|v|d|f|watch)\/([a-z0-9_-]+)/i);
  return m ? m[1].toLowerCase() : e;
}

/** The held draft (hidden_reason HOLD_REASON) that a resent record replaces, or null. */
export function findHeldDraft(items, record) {
  const id = String(record?.id || "").toLowerCase();
  const key = sourceKey(record);
  for (const it of items || []) {
    if (!it || it.hidden !== true || it.hidden_reason !== HOLD_REASON) continue;
    if ((id && String(it.id || "").toLowerCase() === id) || (key && sourceKey(it) === key)) return it;
  }
  return null;
}

/**
 * Can a held draft go live with this title? Same check as at upload time (titleHold) plus the
 * caller's hard checks (`extraOk`, e.g. title-guard reject + minor-lock). Used by /pemilik
 * Tayangkan after Edit, and by a resend.
 */
export function canPublishTitle(title, extraOk = () => true) {
  const t = String(title || "").trim();
  return Boolean(t) && !titleHold(t) && extraOk(t);
}

/**
 * What a new upload does, given the raw catalog items:
 *  - "publish": a held draft for the same video exists and the new title is clean -> publish it
 *    (owner edit title + Unhide), no second copy.
 *  - "hold-again": draft exists, new title still flagged -> reply again, store nothing.
 *  - "hold": no draft, title flagged -> store as hidden draft (hidden_reason HOLD_REASON).
 *  - "new": normal upload.
 */
export function uploadAction(items, record, title, extraOk = () => true) {
  const draft = findHeldDraft(items, record);
  const ok = canPublishTitle(title, extraOk);
  if (draft) return { action: ok ? "publish" : "hold-again", draft };
  return { action: ok ? "new" : "hold", draft: null };
}
