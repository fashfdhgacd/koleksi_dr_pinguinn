/**
 * Hidden-ids list + detector for titles whose content itself is school- or minor-themed
 * (shared by the site catalog and the Telegram bot). Such items are HIDDEN (not deleted): left out of
 * listings, categories, search, related videos, sitemap, and /watch returns 404.
 *
 * Translated wording on adult videos (e.g. "teen" → "remaja") is NOT hidden here;
 * minor-title-guard.ts renames those at display time instead.
 */

/** @param {string} t */
function norm(t = "") {
  return String(t)
    .toLowerCase()
    .replace(/[\u2000-\u200f\u2028-\u202f\u205f\u3000_+&=%#@~^*`\-–—./|()[\]:!?,"“”'’…·•×]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ordered [reason, regex] rules, tested against the normalized raw title. Every term is a whole-word
 * match: slang like "tocil" (small breasts, adult) or words merely containing "cil"/"kecil" never match.
 */
const RULES = [
  // Censored school word in the source titles ("Seragam ***", "Gadis ***", "Kepala ***").
  ["masked-school-term", /\*\*\*/],
  [
    "school",
    /\b(?:(?:anak|cewek|cewe|abg|gadis|bocah|seragam|kelas|pacar|temen|teman|guru|pake|pakai) sma|sma (?:kelas|negeri|swasta|\d+)|smp|smu|smk|esema|siswi|siswa|murid|murit|pelajar|sekolah\w*|osis|pramuka|anak pesantren|putih abu(?: abu)?|putih biru|kakak kelas|adik kelas|anak sd|guru sd|murid sd)\b/,
  ],
  ["school-uniform", /\bseragam\s?(?:18yo|sekolah|olahraga\s+(?:sekolah|smp|sma|sd|siswi|murid))\b|\b(?:masih|baru pulang masih) pa(?:ke|kai) seragam (?:sekolah|sma|smp|sd|putih|pramuka)\b|\babg seragam/],
  ["minor", /\b(?:bocil|di ?bawah umur|under ?age\w*|lolita|loli|shota\w*|anak kecil|gadis kecil|adek kecil|adik kecil|masih kecil|belum sunat|masih abe?ge\w*|umur masih muda)\b/],
  [
    "anime-school",
    /\b(?:jk|joshi ?kou?sei|school ?girls?|school ?boys?|high ?school|kyou?shitsu|classroom|gakuen|seitokai|j class girl)\b|molestific mikoto/,
  ],
  [
    "teacher-student",
    /\b(?:teachers? teach students|my student|hot student)\b|\bdihukum guru\b|\bgadis berseragam\b.*\bguru\b|\bguru\b.*\b(?:wisuda|kemah|perawanku|mengajar|ngajar)\b/,
  ],
  // Classroom setting (not "kelas bintang/atas", not college).
  ["classroom", /\b(?:di ?dalam kelas|dalam kelas|di kelas|kelas sepi)\b/],
  [
    "incest-child",
    /\b(?:ayah|bapak|bapa|papa|daddy)\b.*\banak ?(?:perempuan|gadis|dara|cewek)\b|\banak ?(?:perempuan|gadis|dara|cewek)\b.*\b(?:ayah|bapak|papa|daddy)\b/,
  ],
];

const COLLEGE = /\b(?:mahasisw\w*|kampus|kuliah|dosen|universit\w*|college|uitm)\b/;

// JAV product code (e.g. "SSIS-123", "FC2-PPV-1234567"): English/Japanese genre wording on these is
// costume-genre tag text; minor-title-guard.ts strips it at display time. Explicit minor terms and
// Indonesian school words still block.
const JAV_CODE = /(?<![a-z0-9])(?:[a-z]{2,6}-\d{2,5}|fc2-ppv-\d{5,8})(?![a-z0-9])/i;
const JAV_GENRE_REASONS = new Set(["school", "school-uniform", "teacher-student", "classroom", "masked-school-term"]);
const CHILD_GRADE = /\b(?:smp|sd|sekolah dasar|osis|pramuka|anak pesantren|putih biru|esema)\b/;

/**
 * @param {string} title raw title (before display renaming)
 * @returns {string} reason, or "" when the item may be shown
 */
export function minorContentReason(title = "") {
  const t = norm(title);
  if (!t) return "";
  const isJav = JAV_CODE.test(String(title));
  for (const [reason, re] of RULES) {
    if (!re.test(t)) continue;
    if (isJav && reason === "anime-school") continue;
    // Translated JAV costume-genre wording ("siswi", "seragam sekolah", "di kelas", "guru") is not a
    // minor signal by itself; only child grade levels (SD/SMP) still block.
    if (isJav && JAV_GENRE_REASONS.has(reason) && !CHILD_GRADE.test(t)) continue;
    if (reason === "classroom" && COLLEGE.test(t)) continue;
    // College context: generic wording ("wisuda", "kemah", "guru les", "kakak kelas") is adult, not school.
    if (reason === "teacher-student" && COLLEGE.test(t)) continue;
    if (reason === "school" && COLLEGE.test(t) && !re.test(t.replace(/\b(?:kakak|adik) kelas\b/g, " "))) continue;
    // Tag dumps translated from English ("Lolita, Wanita dewasa, Mahasiswi") are renamed, not hidden.
    if (reason === "minor" && /\blol(?:ita|i)\b/.test(t) && (COLLEGE.test(t) || /\bdewasa\b/.test(t))) continue;
    // "Bapak/Ayah ... anak buah/anak kos/anak tiri" style false positives.
    if (reason === "incest-child" && /\banak (?:buah|kos\w*|magang|majikan|bos|tiri\w*|teman|temen)\b/.test(t) && !/\banak ?(?:nya|perempuan|kandung)\b/.test(t)) continue;
    return reason;
  }
  return "";
}

/** @param {string} title */
export function isMinorContentTitle(title = "") {
  return minorContentReason(title) !== "";
}

/**
 * Owner review priority for a hidden item (does NOT change hidden state):
 *  "check" = "Cek dulu" (likely false positive): unresolved/ambiguous "***" censor, a bare "sma"
 *            with no other school cue (may be a typo of "sama"), or only a "kecil"/"muda"/"abege"
 *            phrase.
 *  "clear" = "Jelas": explicit school/uniform/anime-school/teacher-student/classroom/incest-child.
 * @param {string} reason stored or detected reason
 * @param {string} title title as stored (raw)
 * @returns {"check" | "clear"}
 */
export function reviewPriority(reason = "", title = "") {
  const r = String(reason || "");
  if (r === "masked-school-term" || r.startsWith("masked-check:")) return "check";
  if (r.startsWith("masked-school:")) return "clear";
  if (r === "bot-flag") return "check";
  const t = norm(title);
  if (r === "school" && /\bsma\b/.test(t) && !minorContentReason(t.replace(/\bsma\b/g, " "))) return "check";
  if (r === "minor") {
    const rest = t.replace(/\b(?:anak|gadis|adek|adik|masih) kecil\b|\bumur masih muda\b|\bmasih abe?ge\w*/g, " ");
    if (!minorContentReason(rest)) return "check";
  }
  return "clear";
}

/**
 * Reviewed hidden-ids list (2026-10-08): id → reason. Data stays in the source files;
 * the catalog skips these ids everywhere. New bot uploads matching the detector are stored with
 * `hidden: true` and skipped the same way.
 *
 * "***" titles: an old "Text Import" replaced a word list with "***" in our stored titles. That
 * list wrongly included "tocil" (adult slang for small breasts, NOT minor wording), so a bare
 * "***" proves nothing by itself. Each masked title was resolved against its source page
 * (IndoAV / UserBokep / Streamtape / Putarin, 2026-10-08):
 *  - masked word was only "tocil" → removed from this list; the real source title is restored via
 *    RESTORED_TITLES below (the catalog checks that title, so these are public again).
 *  - "masked-school:<words>"  → the real source title has explicit school wording (stays hidden).
 *  - "masked-check:<words>"   → only an ambiguous word (bare "sma", may be a typo of "sama";
 *                                "anak perawan"; "pelajaran") → stays hidden, owner should check.
 *  - "masked-school-term"     → source page unavailable, real word unknown (stays hidden).
 */
export const HIDDEN_IDS = {
  "Em515XVv1": "dead-videy-mp4",
  "k6E8vbhY1": "dead-videy-mp4",
  "mmIsX3Ae1": "dead-videy-mp4",
  "KAAAzVUQ1": "dead-videy-mp4",
  "XHxd8uqv1": "dead-videy-mp4",
  "3ttnEjDt1": "dead-videy-mp4",
  "0GF6UXVD9gef": "masked-check:sma",
  "0WWCuvLnDl2L": "masked-school:teman sekolah",
  "0boCqfWpPtDa": "masked-check:sma",
  "0huUJe8s4J9f": "school",
  "0lH9D5ucy6La": "masked-school:sekolah",
  "0yUSKRQnmRhe": "school-uniform",
  "1781957000236": "incest-child",
  "1GFbx5i93pOs": "masked-school:pulang sekolah",
  "1aI2TlsVeLxy": "masked-school:pulang sekolah",
  "25XjD3NrWE": "masked-school-term",
  "29GJJkSMtT9j": "masked-check:sma",
  "2WBhXXQ8lQXa": "school",
  "2nqF83WABzWU": "masked-check:sma",
  "3CmZlKyEBlQI": "masked-school:sekolah+murid",
  "3E2Nsxggaxcx": "classroom",
  "3KY4GbZT1JYT": "school-uniform",
  "3QBkUsPRGj": "anime-school",
  "40vQfzyCoMMZ": "masked-check:anak perawan",
  "4PIrxOQDhuyY": "masked-school:sma+sekolah",
  "4RBCLH2sf4Xe": "minor",
  "4ZXhcgRSVCT3q5": "masked-school-term",
  "4hFzilrf88kG": "masked-school:sma",
  "4rXgMKhZr7Wu": "masked-check:sma",
  "4zTpfYtvosVt": "masked-school:sma+sekolah",
  "5nlu3JL4rIAB": "masked-check:sma",
  "5orVyZeWUUua": "masked-check:sma",
  "5u4c0egr8Pwg": "masked-check:sma",
  "619Skwh3yFRd": "masked-check:sma",
  "6WRyjlR1jxeV": "masked-school:sma+sekolah",
  "6jbxnS2MZXtf": "school-uniform",
  "6yvMXMttMqOa": "masked-school:sma",
  "73bsdud28Bbq": "masked-check:sma",
  "75ug6Gygl4Da": "masked-check:sma",
  "7tIAWHSIcoqa": "masked-school:sekolah",
  "8CAmhvuyRmPT": "masked-check:sma",
  "8JzOgXwkbmCJQj": "masked-check:sma",
  "8grtWzryL5Cn": "school",
  "93e99aaUYw8I": "masked-school:sma+sekolah",
  "9CFOdzMIP7Xz": "masked-check:sma",
  "9EC8UyonO0bN": "masked-school:sekolah",
  "9HQbvPEIJVLa": "masked-check:sma",
  "9UCOVY1Src9l": "masked-school:sma+pulang sekolah",
  "9nN1eEXjfh4z": "masked-check:sma",
  "9s8mY7KsjRQc": "masked-school:pulang sekolah",
  "9tDoUDcBsPRk": "masked-check:sma",
  "AYKywhgFwQHl": "masked-check:sma",
  "AZ5freHIWhzY": "masked-school:sma",
  "BKq9qotmpT1T": "masked-school:pelajar",
  "BP7sZplrz0Pe": "masked-school:pelajar",
  "BhWlRwDDl5Kg": "masked-check:sma",
  "BpnpS3GyEt3O": "masked-school:teman sekolah",
  "C55xvkx7wcIM": "masked-school:teman sekolah",
  "CTi4SsMwrcsP": "masked-school-term",
  "CVwpNExsDzR7": "masked-school:murid",
  "CXa4sxWZ7f": "masked-school-term",
  "CdavHUR2tS": "teacher-student",
  "D0q8sTQGqByK": "masked-school:sma+pulang sekolah",
  "D2sqo1qOuhpH": "masked-check:sma",
  "DEpYmW2Rmu": "anime-school",
  "E2hutqKE92aT": "masked-check:sma",
  "E9rdB3umvr9E": "incest-child",
  "ET5CTRfYkHIF": "school-uniform",
  "FK4Xmd2Pc54R": "school",
  "FObYLeXjPCAV": "masked-check:sma",
  "FcaJUWiBSpzB": "anime-school",
  "Fwb1y0oj8LcY": "masked-school:murid",
  "GXKWGGF2aMVt": "masked-check:sma",
  "GeameNDYBs": "masked-school-term",
  "H6Mrqu5vNgKb": "masked-school:sma+pulang sekolah",
  "HKu43Ly2Q37g": "masked-school:sekolah",
  "HM5fqwC2Ymge": "masked-school:sekolah",
  "HNh6MWXMPX40": "incest-child",
  "I9R7eaSSd0Ke": "masked-check:sma",
  "IFizUuQtyVYL": "masked-school:pelajar",
  "IMaTbxY9RzfR": "masked-check:sma",
  "INy8j9sfNQt7": "masked-school:murid",
  "IpDOUBHGpmrY": "masked-school:sekolah",
  "Iv8TtUKkeYzb": "masked-check:sma",
  "J3QnOOKg9CSA": "masked-check:sma",
  "JBjwZY75Sq": "teacher-student",
  "JUr2jZtZsuR4": "incest-child",
  "JeMHstZowb3t": "masked-check:sma",
  "Jm79vWsLrFth": "masked-school-term",
  "JuX2Qi9Z4fOx": "masked-check:sma",
  "KD9TKS2gmzkq": "incest-child",
  "KVSVQXs9g5": "teacher-student",
  "KWPWN0S6mS4j": "minor",
  "KXYArGUHG3": "anime-school",
  "Khr47UZSpP": "anime-school",
  "KrYRxpSmQk": "anime-school",
  "KzJccRTAwHWU": "masked-check:sma",
  "L5z2iPh33NvE": "masked-check:sma",
  "L6vJpq7v0cUx": "masked-school:sekolah",
  "LXnLeVqx5D0J": "masked-school:pelajar",
  "LzzP1hGmDaht": "masked-school:pelajar",
  "M0JXMaVR8vdn": "school-uniform",
  "M1XMCiaXr9qa": "masked-check:sma",
  "M50Zpit7de8z": "masked-check:sma",
  "M9nUbAlgcFGA": "masked-check:sma",
  "MGGWGFOHhX6R": "incest-child",
  "MKk9E4ETJ8XR": "masked-check:sma",
  "MkFvNNmOqNcs": "masked-school:pulang sekolah",
  "Mkha8jSvmU": "anime-school",
  "MrBFbIi0GObS": "masked-school:pulang sekolah",
  "MsFQCOvlM7ac": "masked-check:sma",
  "Mzexb1ucbYJj": "masked-school:sekolah",
  "N7aXLljhMaNa": "masked-school:pulang sekolah",
  "NP1CuqajrqRV": "masked-school:sma",
  "NTjdpAOkI0H8": "masked-check:sma",
  "NqVUU7bKXtkB": "masked-school:pulang sekolah",
  "O6KZfvE3f9jn": "school",
  "OJGnAVqZdSc6": "incest-child",
  "OKRPTITa7AUN": "masked-school:pulang sekolah",
  "OMeIdTiXPS9E": "masked-school:pulang sekolah",
  "OgONupkQkYJK": "masked-school:sma",
  "OuKVQsymqAie": "masked-check:sma",
  "PBVOzZqksYYY": "teacher-student",
  "PJMHaXC89Ls3": "masked-school:pulang sekolah",
  "PKrnYgTsEiX3": "masked-school:sma+sekolah",
  "Q9wmxWeCfw": "teacher-student",
  "QUOuwhWC4AZv": "masked-check:sma",
  "Qf1dnZwVGZ4t": "masked-check:sma",
  "Qj7XHWXH1JrQ": "masked-check:sma",
  "QlmKlcFQCWiA": "masked-check:sma",
  "R4p3aq3KnJ": "masked-school-term",
  "R6I6y2xDxHWv": "masked-check:sma",
  "RAbPVpFXhM": "school-uniform",
  "RPxCuD1fWOWc": "masked-school:sma",
  "RUJ9bTJJX9f9": "incest-child",
  "RWCWF9nuyBOh": "masked-school:smp",
  "RcRDTEB6WevU": "masked-check:sma",
  "ReXlFOKn2Mpv": "masked-school:pulang sekolah",
  "RnsJJB5Bfe": "incest-child",
  "RpIFP9gd8Zfz": "masked-check:sma",
  "SBZZBHmFVzcq": "masked-check:sma",
  "SjcCnO4plD6x": "masked-school:sma+tocil+pulang sekolah",
  "SsIK3fnylSEz": "masked-school:pulang sekolah",
  "Sv8ffPRydB63": "classroom",
  "T1clcbw8ptOe": "masked-school:murid",
  "T4RkZiTKMKX9": "masked-school:siswa+sma",
  "TFnu0x8aZruQ": "masked-school:pelajar",
  "TLtU9d4CxiQN": "masked-check:sma",
  "TQSkhvjbFhe1": "masked-check:sma",
  "TqGFTbwJZLYV": "masked-check:sma",
  "TxFGhb5owQ5T": "masked-school-term",
  "U1ijpHOW3Vaw": "incest-child",
  "UDJwICUl3vxi": "masked-check:sma",
  "UdBlacXkm961": "incest-child",
  "Uo8XwOzNZuFh": "masked-check:sma",
  "UqCXN98wZpNF": "masked-school:sekolah",
  "V54baJRpclz7": "masked-check:sma",
  "VMKCcRhxFJ": "teacher-student",
  "VP6YnSG5we": "anime-school",
  "VRR5nIUhKpVR": "masked-check:sma",
  "VdFH36wbqv8z": "masked-check:sma",
  "W1tYhCaVX0em": "masked-school:sekolah",
  "W4f3uKhdUk": "masked-school-term",
  "W5kcqBdHWAna": "masked-school:pulang sekolah",
  "WDy5K18VxPif": "masked-check:sma",
  "WKFD7Iwd4vBB": "masked-school:pelajar",
  "WREMfVnfD4": "anime-school",
  "Wbz9B9wRkrSb2bX": "masked-school:sekolah",
  "WjGxA7HAph": "anime-school",
  "XAWAPAJ6VQUz2L": "masked-school:sma",
  "XIa5nmu8feqq": "teacher-student",
  "XLhMwsNXfKKS": "masked-check:sma",
  "Y7X2PIzTZC0P": "masked-check:sma",
  "YDQwWmzRLDuv93p": "masked-school:sekolah",
  "YDTn7gdGkGdT": "masked-check:sma",
  "YKrnnKR8aFvO": "masked-school:sma+sekolah",
  "YMpAa1UlctkU": "masked-school:murid",
  "YOK7wKvpqZTvArm": "school",
  "YoTCFQtu65i0": "incest-child",
  "YzMt9AvooGux": "masked-check:sma",
  "YzXq79qq87": "anime-school",
  "ZEwMM1BfiOYv": "classroom",
  "ZVW1TR6QwYGE": "masked-school:sma+bocil",
  "Zn29rfR5agQ2": "masked-school:pelajar",
  "Zqrzga5Sc4": "school",
  "ZrP1BNzfnkMy": "school",
  "ZtP8AjP3FFhm": "masked-check:sma",
  "ZyBB2gg3yf": "masked-school-term",
  "a5dXxZtSUGfN": "masked-check:sma",
  "aQTgzEcDLADD": "school",
  "aaJNPC3T7D": "masked-school-term",
  "acsQjYjYag": "anime-school",
  "arSsxIQ0WMp9": "minor",
  "b5OcYwqVbLOF": "masked-check:sma",
  "bJH9agAW9VVI": "masked-school:pelajar",
  "bWohIkPgIHuY": "masked-check:sma",
  "bzHo0sQ7E0Us": "masked-school:sekolah",
  "c3bSkMTvV3FM": "school",
  "cIvaSElIyuJg": "teacher-student",
  "cXV2wNFJzsEk": "school",
  "dSPeEp4NQawv": "masked-school:pulang sekolah",
  "dVon2k4mxTXX": "masked-check:sma",
  "dnfgYwRgXnzN": "masked-school:murid",
  "dv9qaKoLzrIkLMO": "minor",
  "e2FSM7h36v": "anime-school",
  "e6YzYOwUAXne": "masked-check:sma",
  "e6djhHoIRdKM": "masked-school-term",
  "e7awCFJAeJP6": "masked-school:sma+sekolah",
  "eJMOtalCB67t": "masked-check:sma",
  "ecmrMW7pC2QV": "masked-check:sma",
  "edKW2OW9zRGy": "masked-school:pulang sekolah",
  "f5tpkacNH4": "incest-child",
  "fEqYyiN36XAQ": "masked-check:sma",
  "fHc7HQMQyp0u": "masked-school:pelajar",
  "fUuZzuhTdqLy": "masked-check:sma",
  "fdOY5n8j6FfF": "masked-check:sma",
  "fficBBugFVwY": "incest-child",
  "fnTtkUSrhMuV": "masked-school:sma+sekolah",
  "ftgaNvewMSAY": "masked-check:sma",
  "fvwOtuyJixIm": "masked-check:pelajar",
  "g3GMDK3mrYL8": "masked-check:sma",
  "gNOSXmnezvm9": "masked-check:sma",
  "ga5DZwMxzVRJ": "masked-check:sma",
  "h8ASQuX14HQg": "masked-school:sekolah",
  "hUG9GuM3BG": "teacher-student",
  "hkIDvt3Bi46X": "masked-check:sma",
  "iI1h3FwPJjrF": "masked-check:sma",
  "iKzlETIgY4G8": "masked-check:sma",
  "iTJFKXCyBrK3": "masked-school:pulang sekolah",
  "j14h9oTHNEQK": "masked-school:sekolah",
  "jC8azqC8RWMa": "minor",
  "jCVd57FiBrIp": "school",
  "jUyY5AdvbBAW": "classroom",
  "jWQt8oHvXQfZ": "incest-child",
  "jWqjOrqQV8bI": "masked-check:sma",
  "jjsxfMHnvPxb": "masked-check:sma",
  "kQ3ca5QfwHpr": "masked-school:sekolah",
  "kyYTwKYrzHsv": "masked-check:sma+tocil",
  "lJSguytdWp8x": "classroom",
  "lawP2bdSEMQc": "masked-school:sekolah",
  "lhan1HIVB8HG": "incest-child",
  "mXInac3BWwUw": "masked-school:pelajar",
  "mmeeLRAXdbwQ": "masked-check:sma",
  "nHKWjivsl6Q7": "masked-check:sma",
  "nPC4Cy7dgoOv": "masked-check:sma+tocil",
  "ngMFbTgGAH": "masked-school-term",
  "ngWLGqXajwvb": "masked-school:murid",
  "nuXMGvN428": "masked-school-term",
  "nzWMDZy5XkqV": "masked-check:sma",
  "o0uxsDKW5Wu2": "masked-check:sma",
  "oCo8h4mCfVNB": "masked-check:sma",
  "ojY4CAmckLXi": "school-uniform",
  "oogSzEfYYYio": "masked-school:pulang sekolah",
  "p1ztmFOptEv6": "incest-child",
  "p7khCXKvmQdM": "masked-check:sma",
  "pAw8CdldnjZ6": "classroom",
  "pCjrqOXyozRk": "masked-school:murid",
  "pbcp4DBTToOZ": "masked-check:sma",
  "qYwoTN6B3z0X": "masked-check:sma",
  "qiVmPYhh9LOT": "masked-check:sma",
  "qjHBmiy5ZJoT": "masked-school:sekolah",
  "qoRclCQvQapT": "masked-school:murid",
  "qqX1lAbMKH6L": "masked-school:sekolah",
  "qs4B7tMB5g": "teacher-student",
  "qtm5zSoEiFuu": "masked-school:pulang sekolah",
  "qv3mwemw9DUzgRK": "masked-check:sma",
  "rNXGQkbaORhH": "masked-check:sma",
  "rRr9edaqxQXy": "masked-school:pelajar",
  "radKCjWajOIf": "masked-check:sma",
  "s7IUzB8PDwFG": "masked-check:sma",
  "sB1eDt8iXTLv": "anime-school",
  "sPOQOmysQZGC": "masked-check:sma",
  "sf1h66FPmFcn": "masked-check:sma",
  "shBzBVsk4x4a": "masked-check:sma",
  "suKWRrJZzc": "school",
  "szwEnY8c5z": "anime-school",
  "t2htMaboFu2D": "masked-school:pelajar+sma",
  "t6Wc6ZZXCRUn": "masked-school:sma",
  "tHFVC35H6hqh": "masked-check:sma",
  "tMH9SRU4Uq1n": "masked-school:pelajar",
  "tNUZVtvZTEqf": "masked-school:sma+sekolah",
  "tTwWA9dQfUhx": "masked-check:sma",
  "tWgUKbqoRlC1": "masked-check:sma",
  "tmYBXW4d7bBv": "classroom",
  "tnc2GUczqBmc": "masked-school:pulang sekolah",
  "tucaThmmyuwl": "masked-check:sma",
  "u90fKrsYBS3S": "masked-check:sma",
  "uIVH5grbQQKv": "masked-check:sma",
  "umqN2skfTh5V": "masked-school:sma+pulang sekolah",
  "v5hyFEmYRkaS": "masked-school:sekolah",
  "v5tHG4pqaQBY": "school",
  "vKMrvegSLBQz": "classroom",
  "vnLE0o5G9CQS": "masked-check:sma",
  "voWb7kJpD0I4q7q": "masked-school:sekolah",
  "wDlwoGjr3JCjql": "masked-check:sma",
  "wIEsIb0OJ5HQ": "masked-check:sma",
  "wPxBxkhvoepa": "masked-school:murid",
  "wRRtIB38lfcS": "school",
  "wSGjgJEf53o4": "masked-check:sma",
  "wYZR43jh3XkL": "teacher-student",
  "wjSrszevZn": "anime-school",
  "x3FFNznVYj": "masked-school-term",
  "xJ6Rfm1raT06": "school-uniform",
  "xWpm4bdrJG": "anime-school",
  "xY4sPhYuoaXI": "school",
  "y4ZHpcU29twC": "masked-school:sekolah",
  "yBR2zE6uN1N2": "masked-check:sma",
  "yYbAl3Pzv8OV": "school",
  "ydO966OwmJzZ": "incest-child",
  "yeU1HHHkM8EL": "masked-check:sma",
  "z2mz8xSpuk": "anime-school",
  "zUsbuTwBA1Xb": "masked-check:sma",
  "zwSJfk6W1wjA": "masked-check:sma",
  "zzt2wuCrA7BJ": "masked-check:sma",
  "lu-pgtt9rwkmac9": "drp-sync-skip-non-consent",
  "lu-a9cp3o1cvqch": "drp-sync-skip-non-consent",
  "lu-sik9tszdxv78": "drp-sync-skip-non-consent",
  "lu-zi95dabwday5": "drp-sync-skip-non-consent",
  "lu-bi688n9xwpt9": "drp-sync-skip-minor",
  "lu-98uffavk1mzx": "drp-sync-skip-minor",
  "lu-uh3ir1edclvl": "drp-sync-skip-non-consent",
  "lu-m6oh28jvfo9q": "drp-sync-skip-non-consent",
  "lu-939u3e9z5jaa": "drp-sync-skip-non-consent",
  "lu-4aootcfsglwf": "drp-sync-skip-non-consent",
  "lu-kqy4m2avlf23": "drp-sync-skip-non-consent",
  "lu-4ru4qylw66sj": "drp-sync-skip-non-consent",
  "lu-6wsg4jy17wsl": "drp-sync-skip-non-consent",
  "lu-qron9yrjkooa": "drp-sync-skip-non-consent",
  "lu-x0p5mg6rtn7g": "drp-sync-skip-non-consent",
  "lu-vlslbwmksuw9": "drp-sync-skip-non-consent",
  "lu-w6waoe5i5kq7": "drp-sync-skip-non-consent",
  "lu-40my5qtgg2pu": "drp-sync-skip-non-consent",
  "lu-wykcm5aknmug": "drp-sync-skip-non-consent",
  "lu-eqtrjtg3jl5g": "drp-sync-skip-minor",
  "lu-a6u83ml0vv71": "drp-sync-skip-minor",
  "lu-71i3t11lim99": "drp-sync-skip-minor",
  "lu-51a184sx6fbl": "drp-sync-skip-minor",
  "lu-n6bjv8yj8y9i": "drp-sync-skip-minor",
  "lu-ukqf90ppsl8z": "drp-sync-skip-minor",
  "lu-54e3mepw5a82": "drp-sync-skip-non-consent",
  "lu-35jvg99tqhxk": "drp-sync-skip-non-consent",
  "lu-e5hiihdeh11u": "drp-sync-skip-non-consent",
  "lu-91jrjf8tc51p": "drp-sync-skip-non-consent",
  "lu-jxiho718bmhz": "drp-sync-skip-non-consent",
  "lu-regi9l4ll3dh": "drp-sync-skip-non-consent",
  "lu-qrs89s95lufu": "drp-sync-skip-non-consent",
  "lu-zdfm9l1zbavg": "drp-sync-skip-non-consent",
  "lu-mhqs7o3ss9pa": "drp-sync-skip-non-consent",
  "lu-j5cremegmdy6": "drp-sync-skip-minor",
  "lu-q8cvfd0ka3tu": "drp-sync-skip-non-consent",
  "lu-8ez9rb7ort2k": "anime-minor-character",
  "lu-auttm4u2nolb": "anime-minor-character",
  "lu-9ky5v6vgott7": "anime-minor-character",
  "lu-3v5g86d3hrrq": "anime-minor-risk",
  "lu-3fguh78hn3hu": "drp-sync-skip-minor",
  "lu-vja9cicmtu20": "drp-sync-skip-minor",
  "lu-1lnloglqrq06": "drp-sync-skip-minor",
  "lu-zn9ra9wdnac8": "drp-sync-skip-minor",
  "lu-eyi5v51rojeb": "drp-sync-skip-minor",
  "lu-hud4jsvmubmr": "drp-sync-skip-minor",
  "by-y7tdtuk1p414": "drp-sync-skip-minor",
  "by-cxsn4r6qwwbt": "drp-sync-skip-minor",
  "by-bpkr3994v2xt": "drp-sync-skip-minor",
};

/**
 * Real source titles for stored "***" titles whose censored word was only "tocil" (adult slang),
 * resolved from the source pages on 2026-10-08. Applied at load time as the display title (unless
 * overrides.json sets one) and used for the hidden check instead of the masked "***" title.
 */
export const RESTORED_TITLES = {
  "0KMxmALEWIx0": "Bokep Indo Tocil Omek Memek Pink Idaman Kita Semua (Koleksi Dr. Pinguin Bokep, M.S.B.) Kepengen Ngetod Tuhan Part 2",
  "0cKKSqVzAsWU": "Tocil suka banget colmek, pencolikiawan sejati pasti mau nemenin kamu kak",
  "0l20WOYwImpl": "Nissaa Pamerin Uting Tocil Bisa Dikenyot Loh Dream",
  "0yB2DbuWzXGu": "Bokep Indo Tocil Omek Memek Pink Idaman Kita Semua (Koleksi Dr. Pinguin Bokep, M.S.B.) Kepengen Ngetod Tuhan Part 4",
  "1GR4SSI04911": "Bokep Indo Om Entod ABG Tocil (Koleksi Dr. Pinguin Bokep, M.S.B.) Part 6",
  "1ewozMtdMGbb": "Bokep Indo Om Entod ABG Tocil (Koleksi Dr. Pinguin Bokep, M.S.B.) Part 12",
  "3Pw5Nh7iKRX8": "bersenang-senanglah teman-teman ayo kita coli bersama oke nonton bokep tocil, spong,bokep barat, baokep indo, bokep asia horeee (4)",
  "4JPO64WoZhgu": "Tocil Di Toilet",
  "4dFssGinA7e5": "Gendeng Tocil Mekinya Di masukin Tangan Gile",
  "4qKX6lnFsPjR": "Saya bertanya tanya kenapa ini mafia pentol dapet tocil mulus",
  "5DlMMAikp4rm": "TOCIL ke enakan di entod",
  "6F6loszKSNPZ": "Tocil jembut lebat",
  "6g04l2UD4rZE": "Genjot Memek Sempit ABG Tocil Crot Luar Katanya Takut Hamil",
  "6j0Y4xoKbkhveq": "Kumpulan Video Skandal DheaNoCounter Si Tocil Hyper Viral",
  "6w8Dcf6bK46e": "Tocil Ke Enakan Di Ewek Pacar",
  "7IzQ60AWn5qJ": "Skandal Ngentot Miss N Tocil dan Pacarnya Trending",
  "7bGHzP5hBRPa": "Tocil Cakep Omek Bugil Show",
  "7nGJyjFVm7Ot": "Tocil Lagi Sanget berat Colmek buat muasin diri",
  "7rbHOPND18oL": "Sudah Pasrah Digenjot Kontol Hitam Tocil Satu Ini",
  "85TNHUT9yom8": "Abg Hijab Tocil Colok Meki Nimat Bokep Hijab Ukhti Jilbab Viral",
  "9UXzdNGieIgs": "Bokep Indo Cewek Tocil Blasteran Perawan Belajar Colmek",
  "A843PtJnllVZ": "Kompilasi Caroline Tocil Pantat Besar Entotable Juga",
  "AB8mkzESW95y": "Bokep abg jilbab tocil malaysia bj dimobil",
  "AdC1sY0kYrai": "Jeje Tocil WOT dengan Mainan Sex Kesukaannya HOT51",
  "BLtIXcofmeIF": "Bokep Indo Adik Tocil di Entod Abang Bejat (Koleksi Dr. Pinguin Bokep, M.S.B.) Part 4",
  "BcrFzjiwteDf": "Tocil Suka Colmek (1)",
  "CcBeu6g2ci2u": "Monotirou Ngewe Tetangga Tocil Mulus",
  "CjkW7D9Qk2q0": "Gadis Tocil Takut Hamil Jadi Cuman Berani Sepong Kontol Dulu",
  "CtipUVPvd0Pp": "Bokep Indo Tocil Omek Pakek Dildo Sampe Banjir Lendir Putih (Koleksi Dr. Pinguin Bokep, M.S.B.) Kepengen Ngetod Tuhan",
  "EcC4XfyaFLjI": "ABG Tocil Digenjot Ayang",
  "EkrRAOZdt6h9": "Abg Tocil - Fatin Mandi Bugil",
  "FPynCIhr6p98": "Tocil Lebih Suka Colmek Sambil Direkam Collection Dr. Harimau Bokep, S. M. Sc.",
  "FTRU0Ey52byv": "Bokep Indo Buat Adik Tocil di Entod Abang Bejat (Koleksi Dr. Pinguin Bokep, M.S.B.) Part 6",
  "FWyUZjDl6bX5": "Ukhti Tasya Tocil Lagi Pap Buat Ayang",
  "Fd0FLGl44ELd": "Genjot Memek Sempit ABG Tocil Crot Luar Katanya Takut Hamil",
  "Iav1PTK1wePs": "Pinay Tocil Cantik Yang Lagi Viral",
  "KLWU9plsipBA": "Bikin Pacarku Pasrah Kena Ulekan Cewek Tocil Hyper",
  "KuUtFUah1EKG": "Civi Tocil Masih Perawan Sebinal Ini Main Dildo",
  "LSdXxf2CwUWd": "Bokep Indo Om Entod ABG Tocil (Koleksi Dr. Pinguin Bokep, M.S.B.) Part 8",
  "Lte7FQpj0vvu": "Tocil Mulus",
  "M7xrTXD00Cb0": "Tocil suka omek",
  "MKQetI1dY1Qs": "Si Tocil Ramping Menggila Disodok Mungil HOT51",
  "MTDXYBxb6nEz": "Manasacleo Tocil Nikmattt percakapan (Koleksi Dr. Pinguin Bokep, M.S.B.)",
  "MaeGl7SsTWkW": "VEL Aninn Tocil Colek Tipis Bawahan ID 46159392 Mango",
  "Mg0Ic3obIVhl": "Abg Tocil Jago Di Atas",
  "NQQWQWljdOe6": "bersenang-senanglah teman-teman ayo kita coli bersama oke nonton bokep tocil, spong,bokep barat, baokep indo, bokep asia horeee (1)",
  "NtspObZlKEWk": "Fifi Abg Cantik Tocil Colmekin Memek Pink (Koleksi Dr. Pinguin Bokep, M.S.B.)",
  "OMKAG4EiF6m0": "ABG_Tocil_Open_BO_Malu_Direkam",
  "OdUbI5dJRmWe": "abg tocil ratu tongkrongan di gangbang temen sendiri",
  "SV4Q21JhBVKW": "Jarang Nemu Cewek Tocil Nurut Direkam Saat Bercinta - koleksidrpinguin.com",
  "T2RzwcuCMjZp": "Abg Tocil Memek Becek",
  "TDj0MtXzNXZ3": "Abg Tocil Lagi Belajar WOT",
  "TroAvgKQX1oM": "Tocil Cakep Omek Bugil Show",
  "WCM2AcXgPKnS": "bersenang-senanglah teman-teman ayo kita coli bersama oke nonton bokep tocil, spong,bokep barat, baokep indo, bokep asia horeee (3)",
  "Wv7kR6hhHSbu": "Tocil minta crot dalem part 1",
  "X1519iSjTrsf": "ABG_Tocil_Open_BO_Malu_Direkam",
  "XxSW70MuUiGm": "Kompilasi anita hijab tocil kurus dientot",
  "aA1VFnEAOkU0": "Tocil di Dogyy",
  "b9B9TURvQIKh": "Bokep Indo Tocil Omek Memek Pink Idaman Kita Semua (Koleksi Dr. Pinguin Bokep, M.S.B.) Kepengen Ngetod Tuhan Part 3",
  "bYETnjvIHboX": "Tocil Hyper Cekin Full Percakapan - koleksidrpinguin.com",
  "c8AU6dWBrAAy": "ABG Tocil Open BO Malu Direkam",
  "cf3L8PKQtTkS": "Bokep Indo Cewek Tocil Blasteran Perawan Belajar Colmek",
  "dK9xWy8GpEHI": "Jilbab Kurus Tocil Tapi Nafsunya Kuat",
  "dgSIWY4la9at": "Abg Tocil Sampai Teriak Dientot Kontol Gede (Koleksi Dr. Pinguin Bokep, M.S.B.)",
  "eJPB3bGpm7Q3": "Tocil bagongg enak pisan ie di genjott",
  "eQ6mLI7rPADF": "bersenang-senanglah teman-teman ayo kita coli bersama oke nonton bokep tocil, spong,bokep barat, baokep indo, bokep asia horeee (2)",
  "efURXw3SHoLN": "Bokep Indo Buat Adik Tocil Klimaks Pas di Colmekin (Koleksi Dr. Pinguin Bokep, M.S.B.) Part 6",
  "ejY1sAdw7wJR": "Bokep Indo Menikmati Ulekan Pacar Tocil (Koleksi Dr. Pinguin Bokep, M.S.B.)",
  "f0h3QibVxh7y": "Bokep Indo TOCIL JAGO WOT (Koleksi Dr. Pinguin Bokep, M.S.B.)",
  "fieCL69QHp9y": "Kumpulan Video Skandal DheaNoCounter Si Tocil Hyper Viral Koleksi Dr. Pinguin",
  "fyOUWLXZIgro": "Tocil Jembut lebat khusus UNTUK PENCOLIKIAWAN",
  "gtPWSnfsjEc0": "Chaca Tocil Ajak Suami Teman Threesome Anal HOT51",
  "hWLBbtiB7aeH": "Biarkan Si Tocil Memasak Pasrah Aja Nanti Juga Crot - koleksidrpinguin.com",
  "iBDoiPmCUaML": "Tocil Suka Colmek (2)",
  "iorCVVH8jR3H": "Dua tocil di garab abang",
  "j5vLacLZhUBg": "Abg Chindo Tocil Masih Lugu Di Entot Gada Ekspresi (Koleksi Dr. Pinguin Bokep, M.S.B.)",
  "k7RDu6auMRmY": "Tocil Dapet Kontol Panjang",
  "kg5X9hmededH": "Bokep Indo Pacar Tocil Mencoba Gaya WOT Susah Masukin Ke Memek  (Koleksi Dr. Pinguin Bokep, M.S.B.) No Condom ONLY",
  "koSUjJtVaW1n": "Bokep indoHijab Tocil Colmek Memek Pink (Koleksi Dr. Pinguin Bokep, M.S.B.) Padahal Aku Free Loh kak",
  "kzUy31eajZ7h": "Tocil ke enakan di Ewek",
  "mNpU8pxYqH8i": "Kenalin Nissie Cewek Tocil New Host Barbar Dream",
  "mY19yICjGaio": "Noomi Sora OnlyFans – Tocil Goyang Prone Bone Creampie Ngocor",
  "nlY2aFsUXqlq": "Punya Pacar Tocil Pengen Ngentot Sambil Berdiri - koleksidrpinguin.com",
  "oB65FdRoCOuW": "Bokep Indo Tocil Omek Pakek Dildo Sampe Banjir Lendir Putih (Koleksi Dr. Pinguin Bokep, M.S.B.) Kepengen Ngetod Tuhan Part 2",
  "raDlLwzVbKVF": "Meki Jembut Mulus Zeni Tocil Host Cantik",
  "sVlTePoODsgk": "Tocil Dapet kontol Kecil",
  "syvPchwo7LqL": "Tocil",
  "tcagMvo2XHNg": "Tocil Dapet kontol Kecil (2)",
  "uVD99NjIt7xz": "tocil hyper cekin",
  "uhhKQgaHHC1S": "Jilbab Kurus Tocil Tapi Nafsunya Kuat",
  "uks2lOXzejSe": "Bokep Indo Om Entod ABG Tocil (Koleksi Dr. Pinguin Bokep, M.S.B.) Part 2",
  "vEBTsLrLzr7v": "Ukhti Tocil Ini Ga Bisa Njepit Kontol Pacarnya",
  "vWxRysATB7Wn": "Hoki Banget Dapet Cewek Tocil Entotable Bilang Enak",
  "wJkdL7AwZAIJZMK": "Kompilasi Sextape Talent Fara Tocil Cabe Rawit Bos - koleksidrpinguin.com",
  "xBKAyhan2cWB": "Bokep Indo Om Entod ABG Tocil (Koleksi Dr. Pinguin Bokep, M.S.B.) Part 9",
  "yd0SOiabStw6": "Bokep Indo Tocil Omek Pakek Ludah Sampe Banjir (Koleksi Dr. Pinguin Bokep, M.S.B.)",
  "zkC05YSh7bfL": "Bokep Indo Buat Adik Tocil di Entod Abang Bejat (Koleksi Dr. Pinguin Bokep, M.S.B.) Part 7",
};
