/**
 * Triage for titles the lock pipeline already restricts. It never unlocks anything: it only says
 * whether the lock rests on explicit youth evidence or on a school/uniform keyword alone, so the
 * owner can verify the second kind one by one. Age is never inferred from appearance.
 */

/** Evidence of a student/youth subject: a hard block that stays restricted. */
const EXPLICIT = [
  [/\b(?:siswi|siswa|murid|murit|pelajar|student|schoolgirl|school\s?girl|abg\s+sma|anak\s+(?:sd|smp|sma|sekolah)|sd|smp|smu|smk|esema|jk)\b/, "kata murid/pelajar/jenjang sekolah"],
  [/\bhigh\s?school\b|\bkakak\s+kelas\b|\bteman\s+kelas\b|\bdi\s?bawah\s+umur\b|\bbocil\b|\bloli\b|\btocil\b/, "isyarat anak/umur muda"],
  [/\b(?:[1-9]|1[0-7])\s?(?:yo|y\.o|tahun|thn)\b/, "usia di bawah 18 disebut"],
  [/\bshoujo\b|\bgakuen\b|\bkyoushitsu\b|\bj\s?class\s+girl\b|\bmikoto\b|\bmisaka\b/, "tokoh/istilah anak sekolah"],
];

/** Setting / adult-role words that alone do not show a minor. */
const SETTING = /\b(?:guru|cikgu|ibu\s+guru|pak\s+guru|pramuka|sekolah|seragam|kelas|toilet)\b/;

/**
 * @param {string} title
 * @param {string} [lockReason] e.g. "locked:school" or "hidden" for the detector
 * @returns {{tier: "explicit"|"verification", evidence: string[]}}
 */
export function triageLockedTitle(title = "", lockReason = "") {
  const t = String(title || "")
    .toLowerCase()
    .replace(/\*{2,}/g, " ");
  const evidence = [];
  for (const [re, label] of EXPLICIT) {
    const m = t.match(re);
    if (m) evidence.push(`${label}: "${m[0].trim()}"`);
  }
  if (/minor-detector|^hidden$/.test(lockReason)) evidence.push("detektor menandai anak di bawah umur");
  if (evidence.length) return { tier: "explicit", evidence };
  const s = t.match(SETTING);
  return { tier: "verification", evidence: s ? [`hanya kata latar/peran: "${s[0]}"`] : ["kunci kata kunci tanpa bukti usia"] };
}
