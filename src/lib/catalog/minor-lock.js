/**
 * Hard lock for CLEAR school/minor-themed titles (owner's standing rule: always hidden).
 *
 * hidden-ids.js decides what is hidden by default, and the owner's "Unhide" in /pemilik can
 * override that. For titles that are clearly school/minor themed, Unhide must NOT win; this
 * module decides those. It never deletes or renames anything: the catalog just keeps the item
 * hidden (listings, categories, search, related, sitemap, /watch 404), and it stays visible in
 * the /pemilik hidden list.
 *
 * Why it exists (2026-10-12): "SISWI *** COLMEK" was in the hidden list, but the "***" rule
 * ran before the school rule, so its reason was the weak "masked-school-term" ("Cek dulu").
 * It was then unhidden along with ~340 others. Here the "***" censor is stripped first so the
 * explicit word decides, and censored/obfuscated spellings (s1swi, s*swi, s i s w i,
 * sek0lah, s.m.p, ...) are caught too.
 *
 * Deliberately NOT locked (left to the owner's review): a bare "sma" (often a typo of
 * "sama"), loose "kecil"/"muda"/"abege" phrases, and adult incest wording (mother/aunt).
 */
import { isJavGenreTitle, minorContentReason, reviewPriority } from "./hidden-ids.js";
import { isMinorContentTitle, reviewPriority as detectorPriority } from "./minor-detector.js";

/**
 * Adult age marker (owner exception 2026-10-26): "18yo", "18 yo", "18+", "19yo", "19+", "20 tahun"...
 * A bare number after Eps/Episode/Part/Vol/Ep/Chapter is NOT an age.
 */
const ADULT_AGE = /(?<!\b(?:eps?|episode|part|pt|vol|volume|chapter|ch|no|bagian|seri)\.?\s?)\b(?:1[89]|[2-9]\d)\s?(?:yo|y\.o|years?\s?old|tahun|thn|th)\b|(?<!\b(?:eps?|episode|part|pt|vol|volume|chapter|ch|no|bagian|seri)\.?\s?)\b(?:1[89]|[2-9]\d)\s?\+/;

/** @param {string} title */
export function hasAdultAgeMarker(title = "") {
  return ADULT_AGE.test(String(title || "").toLowerCase());
}

/**
 * hidden-ids.js reason, except a "school-uniform" hit on a title with an adult age marker is
 * re-checked without the uniform word: any other rule still decides; otherwise "" (review only).
 * @param {string} text
 */
function schoolReason(text) {
  const reason = minorContentReason(text);
  if (reason === "school-uniform" && hasAdultAgeMarker(text)) {
    return minorContentReason(text.replace(/\bseragam\b/g, " "));
  }
  return reason;
}

/**
 * Single check for owner title edits (owner-tools.ts edit-video, owner-videy.ts): rejected when the
 * hard lock, the hidden-ids school/minor rules (with the adult-age uniform exception) or the owner
 * detector "block" fires.
 * @param {string} title
 * @returns {string} "" when allowed, otherwise the reason
 */
export function ownerEditBlockReason(title = "") {
  if (!String(title || "").trim()) return "";
  const locked = lockedMinorReason(title);
  if (locked) return locked;
  const r = schoolReason(lower(title));
  if (r) return r;
  if (detectorPriority("", title) === "block") return "detector-block";
  return "";
}

/** Reasons from hidden-ids.js that count as a clear school/minor theme. */
const CLEAR_REASONS = new Set([
  "school",
  "school-uniform",
  "minor",
  "anime-school",
  "teacher-student",
  "classroom",
  "incest-child",
]);

/** Censored / obfuscated spellings of explicit school words (tested on lowercased text). */
const OBFUSCATED = [
  // siswi / siswa: s1swi, s!swi, s*swi, sisw1, $iswi, s-i-s-w-i
  /(?:^|[^a-z0-9])[s$5][\W_]{0,2}[i1!l|*][\W_]{0,2}[s$5][\W_]{0,2}w[\W_]{0,2}[i1!l|*a4@](?![a-z0-9])/,
  // sekolah(an): sek0lah, sek*lah, s3kolah, sekol4h
  /(?:^|[^a-z0-9])[s$5][\W_]{0,2}[e3*][\W_]{0,2}k[\W_]{0,2}[o0*][\W_]{0,2}l[\W_]{0,2}[a4@*][\W_]{0,2}h/,
  // pelajar: pel4jar, p3lajar, pel*jar
  /(?:^|[^a-z0-9])p[\W_]{0,2}[e3*][\W_]{0,2}l[\W_]{0,2}[a4@*][\W_]{0,2}j[\W_]{0,2}[a4@*][\W_]{0,2}r(?![a-z0-9])/,
  // pramuka: pr4muka, pram*ka
  /(?:^|[^a-z0-9])pr[\W_]{0,2}[a4@*][\W_]{0,2}m[\W_]{0,2}[u*][\W_]{0,2}k[\W_]{0,2}[a4@*](?![a-z0-9])/,
  // smp / smu / smk with separators (s.m.p, s-m-k). Not "sma": too often "sama".
  /(?:^|[^a-z0-9])s[.\-_*\s]m[.\-_*\s]?[pku](?![a-z0-9])/,
  /(?:^|[^a-z0-9])s[.\-_*\s]?m[.\-_*\s][pku](?![a-z0-9])/,
  // schoolgirl: sch00lgirl, sch*ol girl
  /sch[o0*]{2}l[\W_]{0,2}g[i1!*]rl/,
];

/** Adult incest wording that hidden-ids.js files under "incest-child" but is not about a minor. */
const ADULT_INCEST_ONLY = /\b(?:ibu kandung|anak dan ibu|orang tua dan anak)\b/;
const CHILD_CUE = /\b(?:ayah|bapak|bapa|papa|daddy)\b|\bponakan\b|\bkeponakan\b|\bbudak\b/;

function lower(t) {
  return String(t || "").toLowerCase();
}

/** Join letter-by-letter spelling ("s i s w i" → "siswi"); only runs of 4+ single letters. */
function joinSpelled(t) {
  return t.replace(/\b(?:[a-z][ .\-_]){3,}[a-z]\b/g, (m) => m.replace(/[ .\-_]/g, ""));
}

/**
 * @param {string} title raw title (before display renaming)
 * @returns {string} "" when not locked, otherwise "locked:<reason>"
 */
export function lockedMinorReason(title = "") {
  const raw = lower(title);
  if (!raw.trim()) return "";
  // Owner-supplied detector (minor-detector.js): "minor" = block. Additive: rules below still run.
  if (isMinorContentTitle(title)) return "locked:minor-detector";
  // Strip the "***" censor so the explicit words decide (not the weak masked-term rule).
  const unmasked = raw.replace(/\*{2,}/g, " ");
  for (const text of [unmasked, joinSpelled(unmasked)]) {
    const reason = schoolReason(text);
    if (reason && CLEAR_REASONS.has(reason) && reviewPriority(reason, text) === "clear") {
      if (reason === "incest-child" && ADULT_INCEST_ONLY.test(text) && !CHILD_CUE.test(text)) continue;
      return `locked:${reason}`;
    }
  }
  // Same JAV exemption as hidden-ids.js: the spelling patterns also match the plain words.
  if (isJavGenreTitle(title)) return "";
  for (const re of OBFUSCATED) {
    if (re.test(raw)) return "locked:school-obfuscated";
  }
  return "";
}

/**
 * Individually reviewed videos whose titles suggest minors but that the word rules above leave
 * to review ("kecil"/"muda"/"abege" phrases). Locked by exact id only, never by broad words.
 */
export const LOCKED_MINOR_IDS = {
  "4RBCLH2sf4Xe": "Adek kecil sudah open bo",
  jC8azqC8RWMa: "masih abege sudah pandai",
  arSsxIQ0WMp9: "Umur Masih Muda Body Orang Dewasa Meki Masih Sempit",
};

/** @param {string} id */
export function isLockedMinorId(id = "") {
  return Object.prototype.hasOwnProperty.call(LOCKED_MINOR_IDS, String(id || "").trim());
}

/** @param {string} title */
export function isLockedMinorTitle(title = "") {
  return lockedMinorReason(title) !== "";
}
