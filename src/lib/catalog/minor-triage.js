/**
 * Four separate facts about a restricted title. Nothing here proves a performer's real age, and
 * nothing here changes publication: the lock pipeline (minor-lock.js) decides visibility.
 *
 *  1. contextKeywords      school / uniform / youth words found in the title (context only).
 *  2. fictionalCharacter   anime/hentai framing and any age the title states for the character.
 *  3. performerAge         what the title CLAIMS about a real performer's age. "claims_minor" is a
 *                          hard block (stated under-18 age, "di bawah umur", SD/SMP, loli/bocil);
 *                          "claims_adult" is a stated 18+; "unknown" is the default.
 *                          Age is never inferred from appearance and a title is not proof.
 *  4. verification         owner-recorded state; "unverified" until the owner records otherwise.
 */

const CONTEXT = [
  /\b(?:siswi|siswa|murid|murit|pelajar|schoolgirl|school\s?girl|high\s?school|esema|smu|smk|jk|pramuka|seragam|kakak\s+kelas|teman\s+kelas|sekolah|cikgu|kelas|j\s?class\s+girl|abg\s+sma|ibu\s+guru|pak\s+guru|guru)\b/g,
  /\bgakuen\b|\bkyoushitsu\b|\bshoujo\b/g,
];

const FICTION = /\b(?:eps?|episode|gakuen|shoujo|kyoushitsu|hentai|anime|mikoto|misaka|jutai)\b/;

const MINOR_CLAIM = [
  [/\bdi\s?bawah\s+umur\b|\bunder\s?age\b/, "judul menyebut di bawah umur"],
  [/\b(?:loli|lolicon|bocil|tocil|shota)\b/, "judul memakai istilah anak"],
  [/\banak\s+(?:sd|smp|sma)\b|\b(?:sd|smp)\b/, "judul menyebut jenjang SD/SMP"],
  [/\b(?:[1-9]|1[0-7])\s?(?:yo|y\.o|tahun|thn|years?\s?old)\b/, "judul menyebut usia di bawah 18"],
];

const ADULT_CLAIM = /\b(?:1[89]|[2-9]\d)\s?(?:yo|y\.o|tahun|thn|years?\s?old)\b|\b(?:1[89]|[2-9]\d)\s?\+/;

/**
 * @param {string} title
 * @param {{ detector?: boolean, verification?: string }} [opts] detector = the owner detector marked "minor"
 */
export function classifyRestriction(title = "", { detector = false, verification = "unverified" } = {}) {
  const t = String(title || "")
    .toLowerCase()
    .replace(/\*{2,}/g, " ");
  /** @type {string[]} */
  const contextKeywords = [];
  for (const re of CONTEXT) for (const m of t.matchAll(re)) if (!contextKeywords.includes(m[0])) contextKeywords.push(m[0]);

  const isFictional = FICTION.test(t);
  const stated = t.match(/\b(\d{1,2})\s?(?:yo|y\.o|tahun|thn|years?\s?old)\b/);
  const fictionalCharacter = {
    framing: isFictional ? "fiksi/anime" : "tidak terdeteksi",
    statedAge: isFictional && stated ? Number(stated[1]) : null,
  };

  const minorEvidence = [];
  for (const [re, label] of MINOR_CLAIM) {
    const m = t.match(re);
    if (m) minorEvidence.push(`${label}: "${m[0].trim()}"`);
  }
  if (detector) minorEvidence.push("detektor menandai anak di bawah umur");
  const performerAge = minorEvidence.length
    ? { claim: "claims_minor", evidence: minorEvidence }
    : ADULT_CLAIM.test(t)
      ? { claim: "claims_adult", evidence: ["judul menyebut usia 18+ (bukan bukti)"] }
      : { claim: "unknown", evidence: [] };

  return {
    contextKeywords,
    fictionalCharacter,
    performerAge,
    verification,
    hardBlock: performerAge.claim === "claims_minor",
  };
}

/** Panel summary: "explicit" only for a minor claim; everything else needs verification. */
export function triageLockedTitle(title = "", lockReason = "") {
  const c = classifyRestriction(title, { detector: /minor-detector|^hidden$/.test(lockReason) });
  const evidence = c.hardBlock
    ? c.performerAge.evidence
    : [c.contextKeywords.length ? `hanya konteks: ${c.contextKeywords.slice(0, 4).join(", ")}` : "kunci kata kunci tanpa bukti usia"];
  /** @type {"explicit" | "verification"} */
  const tier = c.hardBlock ? "explicit" : "verification";
  return { tier, evidence, ...c };
}
