/**
 * REVIEW_PENDING (owner decision 2026-11-02): a video whose performers' age cannot be confirmed is
 * withheld from the public site until the owner approves it in /pemilik ("Perlu dicek") with
 * credible proof that every performer was 18+ at production. Withheld = hidden like any other
 * hidden item (/watch 404 keeps the data; off categories, search, Tonton juga, AI Indo, homepage,
 * sitemap, IndexNow). Nothing is deleted. Approval = the owner Unhide list (KV owner:unhide:v1)
 * plus the proof note in the review state; "keep pending" changes nothing.
 *
 * Age is never inferred from a title, a translation or appearance: title signals below only ROUTE
 * a video here; they never prove age either way. Same rules for every category. Explicit minor
 * signals are not here: those stay banned/locked (minor-lock.js, minor-detector.js "minor").
 * Computed once per catalog build / per upload: no per-visit work.
 */
import { minorContentReason } from "./minor-detector.js";
import { lockedMinorReason, schoolReason } from "./minor-lock.js";
import { detectMinor, ownerChecked18 } from "./minor-context.js";
import { waivedHoldTerm } from "../bot/title-hold.js";
import { hasJavCode } from "../bot/title-guard.js";

export const REVIEW_PENDING = "review-pending";

/**
 * Individually listed: news reports tie the name "Andini Permata" to alleged minors. Kept pending
 * by id (and by the name below) and never used for SEO (no tag, page or description targets it).
 * The "Andini ... viral" entries may be the same case; pending until the owner checks.
 */
/** @type {Record<string, string>} */
export const REVIEW_PENDING_IDS = {
  fU9dgPetb226: "nama dikaitkan berita dengan dugaan anak di bawah umur (Andini Permata)",
  SQpz6PgD4MUt: "nama dikaitkan berita dengan dugaan anak di bawah umur (Andini Permata)",
  KCKHCOSFfzg5: "nama dikaitkan berita dengan dugaan anak di bawah umur (Andini Permata)",
  c8VEP4fGk5Rd: "mungkin kasus viral yang sama (Andini Permata), belum dipastikan",
  kyYjJPLvB3os: "mungkin kasus viral yang sama (Andini Permata), belum dipastikan",
  zoCTOOLKITXx: "mungkin kasus viral yang sama (Andini Permata), belum dipastikan",
};
const NAME_RE = /\bandini\W*permata\b/i;

const norm = (/** @type {unknown} */ s) => ` ${String(s || "").toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ")} `;

/** "anak" as someone's child next to a parent (not step-family, boarding house, intern, etc.). */
const PARENT_RE = /\b(?:ayah|bapak|bapa|papa|papah|ibu|mama|mamah|emak|mami|kandung)\b/;
const ADULT_ANAK_RE =
  /\b(?:tiri|tirinya|tiriku|kos|kost|kosan|magang|majikan|majilan|juragan|bos|pejabat|artis|tetangga|punk|kuliah|mahasiswi|mahasiswa|gadis|ibu kost|ibu kos|teman|tongkrongan|gang|citayem|jakarta)\b/;
/** Wording where the age is genuinely unclear: masked word after "anak", "kids these days", baby talk. */
const UNCLEAR_RE = /\banak\s*\*{2,}|\banak\s+jaman\s+sekarang\b|\bsi\s+kecil\b/;

/** Title-signal reason ("" = none). Explicit minor titles return "" here (they are locked elsewhere). */
export function titleReviewReason(title = "") {
  const raw = String(title || "");
  if (!raw.trim()) return "";
  if (lockedMinorReason(raw) || minorContentReason(raw) === "minor") return "";
  const t = norm(raw);
  if (NAME_RE.test(t)) return "nama dikaitkan berita dengan dugaan anak di bawah umur (Andini Permata)";
  const unclear = t.match(UNCLEAR_RE);
  if (unclear) return `kata "${unclear[0].replace(/\s+/g, " ").trim()}" (umurnya tidak jelas)`;
  const claim = ownerChecked18(raw);
  const school = schoolReason(raw);
  if (claim && (school === "classroom" || school === "teacher-student")) {
    return `latar ${school === "classroom" ? "kelas" : "guru-murid"} + klaim umur 18 di judul (klaim judul bukan bukti)`;
  }
  const waived = waivedHoldTerm(raw);
  if (waived) return `kata "${waived}" (umur ambigu) + klaim umur 18 di judul (klaim judul bukan bukti)`;
  if (claim && /\banak\b/.test(t)) return "kata \"anak\" + klaim umur 18 di judul (klaim judul bukan bukti)";
  const ctx = detectMinor(raw);
  if (ctx.verdict === "review" && claim) return "sinyal merah + klaim umur 18 di judul (klaim judul bukan bukti)";
  const parent = t.match(PARENT_RE);
  if (minorContentReason(raw) === "review" && parent && !ADULT_ANAK_RE.test(t)) {
    return `kata "anak" bersama "${parent[0]}": umur pemeran tidak bisa dipastikan dari judul`;
  }
  return "";
}

/**
 * JAV (owner rule 2026-11-02): category "jav" or a studio product code ("SSIS-123"). Japanese studio
 * productions with age-verified performers: "student", "teen", "di kelas" etc. are genre/roleplay
 * labels there, so title signals never route a JAV video to REVIEW_PENDING. Explicit minors (child
 * grade levels, an age under 18, the hard reject list) are still locked/banned by the other checks.
 * @param {string} [category]
 * @param {string[]} [titles]
 */
export function isJavItem(category = "", titles = []) {
  return String(category || "").trim().toLowerCase() === "jav" || titles.some((t) => hasJavCode(String(t || "")));
}

/** Anime/hentai: drawn characters have no production age to verify, so the strict path applies. */
export function isAnimeItem(category = "") {
  return /^(?:hentai|anime|kartun|3d)$/.test(String(category || "").trim().toLowerCase());
}

/**
 * Strong minor signals in the STORED title (not just one ambiguous word). A new title would only hide
 * them, not answer them, so these need proof (strict), whatever the owner title says:
 *  - "anak ***": a censored word after "anak", usually a school grade (SD/SMP/SMA);
 *  - "anak jaman sekarang" ("kids these days"), usually said about teenagers;
 *  - a father with a child ("ayah ... anak", "anak perempuan dan ayah");
 *  - ABG/anak/teen/remaja in a school setting (seragam, di kelas, guru, UKS, tugas, sekolah).
 */
const STRONG_SIGNALS = [
  ["kata \"anak ***\" (sensor, biasanya jenjang sekolah)", /\banak\s*\*{2,}/],
  ["\"anak jaman sekarang\" (biasanya soal remaja)", /\banak\s+(?:jaman|zaman)\s+sekarang\b/],
  ["ayah + anak", /\b(?:ayah|bapak|papa|bokap|daddy|father)\b.*\banak\b|\banak\b(?:\s+\w+){0,3}\s+(?:dan|sama|&)\s+(?:ayah|bapak|papa|bokap)\b/],
  [
    "ABG/anak + konteks sekolah",
    /(?=.*\b(?:abg|anak|teen|remaja)\b).*\b(?:seragam|di\s+kelas|guru\w*|uks|tugas|sekolah)\b/,
  ],
];

/** @param {string[]} titles @returns {string} the strong signal label, or "" */
export function strongMinorSignal(titles = []) {
  for (const t of titles) {
    const n = norm(t);
    for (const [label, re] of STRONG_SIGNALS) if (/** @type {RegExp} */ (re).test(n)) return String(label);
  }
  return "";
}

/**
 * Strict REVIEW_PENDING: an owner title edit does not release it; only the owner's explicit
 * "Tayangkan" with a proof note does. The Andini Permata set (by id or name), a strong minor signal
 * in the stored title (strongMinorSignal, not for JAV) and anime/hentai with an age-unclear signal.
 * @param {string} [id]
 * @param {string[]} [titles]
 * @param {string} [category]
 */
export function strictPendingReason(id = "", titles = [], category = "") {
  const listed = REVIEW_PENDING_IDS[String(id || "").trim()];
  if (listed) return listed;
  for (const t of titles) if (NAME_RE.test(norm(t))) return "nama dikaitkan berita dengan dugaan anak di bawah umur (Andini Permata)";
  if (!isJavItem(category, titles)) {
    const strong = strongMinorSignal(titles);
    if (strong) return `${strong}: umur pemeran perlu bukti, judul baru tidak cukup`;
  }
  if (isAnimeItem(category)) {
    for (const t of titles) {
      const r = titleReviewReason(t);
      if (r) return `anime/hentai: ${r}`;
    }
  }
  return "";
}

/**
 * REVIEW_PENDING reason for a catalog item ("" = not pending).
 * - Listed ids and the Andini name: always pending; only owner approval releases them.
 * - JAV: never from title signals.
 * - Otherwise an item is pending only when the title check flags one of its titles. Then:
 *   - a strong signal in any title, or an anime/hentai item, keeps it pending (strict, owner approval);
 *   - else the OWNER title wins (owner rule 2026-11-02): with an owner title (/pemilik edit or
 *     overrides.json) only that title is checked, so a clean edit releases the video at once.
 * Strong signals never make an item pending by themselves, so they cannot downgrade a harder hide
 * (school/uniform reasons in hidden-ids) to a reviewable status.
 * @param {string} [id]
 * @param {string[]} [titles] stored titles (stored, restored, auto-meta), not the owner title
 * @param {{ ownerTitle?: string, category?: string }} [opts]
 */
export function reviewPendingReason(id = "", titles = [], opts = {}) {
  const ownerTitle = String(opts.ownerTitle || "").trim();
  const all = ownerTitle ? [...titles, ownerTitle] : titles;
  const key = String(id || "").trim();
  if (REVIEW_PENDING_IDS[key]) return `${REVIEW_PENDING}: ${REVIEW_PENDING_IDS[key]}`;
  for (const t of all) if (NAME_RE.test(norm(t))) return `${REVIEW_PENDING}: nama dikaitkan berita dengan dugaan anak di bawah umur (Andini Permata)`;
  if (isJavItem(opts.category, all)) return "";
  let flagged = "";
  for (const t of all) {
    flagged = titleReviewReason(t);
    if (flagged) break;
  }
  if (!flagged) return "";
  const strict = strictPendingReason(id, all, opts.category);
  if (strict) return `${REVIEW_PENDING}: ${strict}`;
  for (const t of ownerTitle ? [ownerTitle] : titles) {
    const r = titleReviewReason(t);
    if (r) return `${REVIEW_PENDING}: ${r}`;
  }
  return "";
}

/**
 * Automatic holds that a clean owner title edit releases (the owner's title wins over the automatic
 * check). Hard minor locks ("detector-minor", school/minor reasons, minor-lock ids) are not here.
 * @param {string} [reason]
 */
export function releasedByOwnerTitle(reason = "") {
  const r = String(reason || "");
  return r.startsWith(REVIEW_PENDING) || r === "title-rename" || r === "detector-review";
}

export function isReviewPendingReason(reason = "") {
  return String(reason || "").startsWith(REVIEW_PENDING);
}
