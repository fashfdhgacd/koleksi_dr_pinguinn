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
    .replace(/[_\-–—./|()[\]:!?,"“”'’]+/g, " ")
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
    /\b(?:sma|smp|smu|smk|esema|siswi|siswa|murid|murit|pelajar|sekolah\w*|osis|pramuka|anak pesantren|putih abu(?: abu)?|putih biru|kakak kelas|adik kelas|anak sd|guru sd|murid sd)\b/,
  ],
  ["school-uniform", /\bseragam\s?(?:18yo|sekolah|olahraga)\b|\b(?:masih|baru pulang masih) pake seragam\b|\babg seragam/],
  ["minor", /\b(?:bocil|di ?bawah umur|under ?age\w*|lolita|loli|shota\w*|anak kecil|gadis kecil|adek kecil|adik kecil|masih kecil|belum sunat|masih abe?ge\w*|umur masih muda)\b/],
  [
    "anime-school",
    /\b(?:jk|joshi ?kou?sei|school ?girls?|school ?boys?|high ?school|kyou?shitsu|classroom|gakuen|seitokai|j class girl)\b|molestific mikoto/,
  ],
  ["teacher-student", /\b(?:teachers? teach students|my student|hot student)\b|\bguru les\b|\bdihukum guru\b|\bgadis berseragam\b.*\bguru\b|\bguru\b.*\b(?:wisuda|kemah|perawanku)\b|\b(?:kemah|perawanku)\b.*\bguru\b/],
  // Classroom setting (not "kelas bintang/atas", not college).
  ["classroom", /\b(?:di ?dalam kelas|dalam kelas|di kelas|kelas sepi)\b/],
  [
    "incest-child",
    /\b(?:ayah|bapak|bapa|papa|daddy)\b.*\banak ?(?:nya|perempuan|ku|sendiri)?\b|\banak ?(?:nya|perempuan)?\b.*\b(?:ayah|bapak)\b|\banak dan ibu\b|\bibu kandung\b|\banak kandung\b|\borang tua dan anak\b|\bbudak saha\b|\bngasuh ponakan\b|\bthr ke \d* ?ponakan\b|\bmerawat adik keponakan\b|\bkeponakan yg mungil\b/,
  ],
];

const COLLEGE = /\b(?:mahasisw\w*|kampus|kuliah|dosen|universit\w*|college|uitm)\b/;

/**
 * @param {string} title raw title (before display renaming)
 * @returns {string} reason, or "" when the item may be shown
 */
export function minorContentReason(title = "") {
  const t = norm(title);
  if (!t) return "";
  for (const [reason, re] of RULES) {
    if (!re.test(t)) continue;
    if (reason === "classroom" && COLLEGE.test(t)) continue;
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
 *  - masked word was only "tocil" → removed from this list; the real title is restored through
 *    overrides.json (the catalog checks the override title, so these are public again).
 *  - "masked-school:<words>"  → the real source title has explicit school wording (stays hidden).
 *  - "masked-check:<words>"   → only an ambiguous word (bare "sma", may be a typo of "sama";
 *                                "anak perawan"; "pelajaran") → stays hidden, owner should check.
 *  - "masked-school-term"     → source page unavailable, real word unknown (stays hidden).
 */
export const HIDDEN_IDS = {
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
};
