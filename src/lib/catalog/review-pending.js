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
  if (UNCLEAR_RE.test(t)) return "kata yang umurnya tidak jelas (anak ***/anak jaman sekarang/si kecil)";
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
  if (minorContentReason(raw) === "review" && PARENT_RE.test(t) && !ADULT_ANAK_RE.test(t)) {
    return "\"anak\" bersama kata orang tua: umur pemeran tidak bisa dipastikan dari judul";
  }
  return "";
}

/**
 * REVIEW_PENDING reason for a catalog item ("" = not pending). `titles` = every title we have for
 * it (stored, owner edit, override); an owner title edit never clears it, only approval does.
 * @param {string} [id]
 * @param {string[]} [titles]
 */
export function reviewPendingReason(id = "", titles = []) {
  const listed = REVIEW_PENDING_IDS[String(id || "").trim()];
  if (listed) return `${REVIEW_PENDING}: ${listed}`;
  for (const t of titles) {
    const r = titleReviewReason(t);
    if (r) return `${REVIEW_PENDING}: ${r}`;
  }
  return "";
}

export function isReviewPendingReason(reason = "") {
  return String(reason || "").startsWith(REVIEW_PENDING);
}
