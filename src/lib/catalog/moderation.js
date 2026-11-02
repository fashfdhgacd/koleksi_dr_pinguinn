/**
 * Upload moderation decision (owner rules 2026-11-02). One place for the bot upload path so every
 * category is judged the same way. Pure functions over data we already have: the typed title, the
 * source page title / metadata title (original language), the category and the JAV code. No new
 * services, no env vars, nothing per visit.
 *
 *  1. Minors / child exploitation stay banned: explicit grade levels (SD/SMP/SMA), "di bawah umur",
 *     bocil/loli, ages under 18 and the other hard rules (minor-lock.js, minor-detector.js "minor",
 *     minor-context.js hard floor) hide/lock exactly as before.
 *  2. One translated or ambiguous word is not proof of a minor: "budak" (Malay/Sundanese), "anak kos",
 *     "anak tiri", "les privat", "keponakan", "kampus", "mahasiswi", "muda" publish normally.
 *  3. Age is never inferred from a title either way. A title signal that leaves the performers' age
 *     unconfirmed (an "18yo" claim next to ABG/teen/classroom, "anak" with a parent, a masked word,
 *     a name tied to alleged minors) is REVIEW_PENDING (review-pending.js): withheld from the public
 *     site, data kept, listed in /pemilik "Perlu dicek" with the reason until the owner approves it
 *     with proof that every performer was 18+.
 *  4. Runs on NEW uploads; the catalog applies the same review-pending.js rules at build time.
 */
import { lockedMinorReason, schoolReason, youthCampusReason } from "./minor-lock.js";
import { reviewPriority as detectorPriority } from "./minor-detector.js";
import { detectMinor } from "./minor-context.js";
import { REVIEW_PENDING, isJavItem, releasedByOwnerTitle, titleReviewReason } from "./review-pending.js";
import { minorContentReason } from "./hidden-ids.js";
import { titleHold } from "../bot/title-hold.js";

/** An explicit age under 18 ("16 tahun", "15yo", "17 y.o"); episode/part numbers excluded. */
const UNDER_18_AGE =
  /(?<!\b(?:eps?|episode|part|pt|vol|volume|chapter|ch|no|bagian|seri|umur\s+\d+\s*-)\s?)\b1[0-7]\s?(?:yo|y\.?\s?o\.?|years?\s?old|tahun|thn|th)(?![\p{L}\p{N}])/iu;

/**
 *  5. JAV (category "jav" or a studio product code, owner rule 2026-11-02): studio productions with
 *     age-verified performers. "student", "teen", "di kelas", "guru" are roleplay/genre labels there,
 *     so only the hard bans (1: lock list, detector "block") and an explicit age under 18 hold it.
 * @param {string} text every title we have for the upload (typed + source/original + metadata)
 * @param {{ category?: string }} [opts]
 * @returns {{ hide: string, review: string }} hide = hidden_reason to store ("" = publish);
 *   review = the REVIEW_PENDING reason shown in /pemilik ("" = none).
 */
export function uploadModeration(text = "", opts = {}) {
  const t = String(text || "");
  if (!t.trim()) return { hide: "", review: "" };
  if (isJavItem(opts.category, [t])) {
    const locked = lockedMinorReason(t);
    if (locked) return { hide: locked, review: "" };
    if (detectorPriority("", t) === "block") return { hide: "detector-minor", review: "" };
    if (UNDER_18_AGE.test(t)) return { hide: "detector-review", review: "" };
    return { hide: "", review: "" };
  }

  // 1) Banned: hard lock / explicit minor terms.
  const locked = lockedMinorReason(t);
  if (locked) return { hide: locked, review: "" };
  if (detectorPriority("", t) === "block") return { hide: "detector-minor", review: "" };
  const ctx = detectMinor(t);
  // Context scorer hard floor (an age number, obfuscated term): held for the owner with the reason
  // shown in /pemilik. Held, not banned, because "2 tahun nikah" also trips the age floor.
  if (ctx.verdict === "minor") return { hide: "detector-review", review: "" };
  // An explicit under-18 age is never cancelled by an "18yo" elsewhere in the title.
  if (UNDER_18_AGE.test(t)) return { hide: "detector-review", review: "" };

  // 2) Age unconfirmed by a title signal: REVIEW_PENDING (withheld, owner approves with proof).
  const pending = titleReviewReason(t);
  if (pending) return { hide: `${REVIEW_PENDING}: ${pending}`, review: pending };

  // 3) School/minor word rules (hidden-ids.js via schoolReason) and campus-youth: held as before.
  const school = schoolReason(t);
  if (school) return { hide: school, review: "" };
  const youth = youthCampusReason(t);
  if (youth) return { hide: youth, review: "" };

  // 4) Real red context without an age claim (minor-context.js score >= 3): held for the owner.
  if (ctx.verdict === "review") return { hide: "detector-review", review: "" };
  // Family / step-family / boarding-house wording alone is adult genre: publish.
  return { hide: "", review: "" };
}

/**
 * Owner title priority (owner rule 2026-11-02): does the owner's edited title release an automatic
 * upload hold? Only automatic holds (review-pending / title-rename / detector-review) are released,
 * and only when the edited title passes the same upload check again. Hard minor locks never are.
 * @param {string} reason stored hidden_reason
 * @param {string} title the owner's edited title
 * @param {string} [category]
 */
export function ownerTitleReleases(reason, title, category = "") {
  if (!releasedByOwnerTitle(reason) || !String(title || "").trim()) return false;
  if (uploadModeration(title, { category }).hide) return false;
  if (isJavItem(category, [title])) return true;
  return minorContentReason(title) === "" && !titleHold(title);
}
