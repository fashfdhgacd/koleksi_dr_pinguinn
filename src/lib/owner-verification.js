/**
 * Owner verification ledger for restricted titles (/pemilik "Ditahan"). Records what the owner
 * concluded and keeps a change history. It never publishes anything by itself: "false_positive"
 * only lifts the KEYWORD lock for that one id (hard minor claims can never be released), and the
 * video still needs the owner's separate Tayangkan.
 * Plain JS so it can be tested with node --test.
 */
import { lockedMinorReason } from "./catalog/minor-lock.js";
import { classifyRestriction } from "./catalog/minor-triage.js";

export const VERIFICATION_STATUSES = ["false_positive", "awaiting_verification", "keep_restricted"];
const MAX_HISTORY = 20;

/** @typedef {{ status: string, at: number, note: string }} VerificationChange */
/** @typedef {{ status: string, at: number, note: string, title?: string, history: VerificationChange[] }} VerificationEntry */

/**
 * Why a title can never be released as a false positive ("" = it can).
 * @param {string} title
 */
export function releaseBlock(title = "") {
  const c = classifyRestriction(title);
  if (c.hardBlock) return "klaim usia di bawah 18 pada judul";
  if (lockedMinorReason(title) === "locked:minor-detector") return "ditandai detektor minor";
  return "";
}

/**
 * @param {Record<string, VerificationEntry> | undefined} map
 * @param {string} id
 * @param {string} status
 * @param {{ note?: string, title?: string, now?: number }} [opts]
 * @returns {Record<string, VerificationEntry>}
 */
export function recordVerification(map, id, status, { note = "", title = "", now = Date.now() } = {}) {
  const prev = map?.[id];
  const cleanNote = String(note || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const history = [...(prev?.history || []), { status, at: now, note: cleanNote }].slice(-MAX_HISTORY);
  return {
    ...(map || {}),
    [id]: { status, at: now, note: cleanNote, ...(title ? { title: String(title).slice(0, 200) } : {}), history },
  };
}

/**
 * Ids whose keyword lock is lifted: owner said false positive and the title carries no hard claim.
 * @param {Record<string, VerificationEntry> | undefined} map
 * @param {(id: string) => string | undefined} [titleOf] current title, so a later edit re-checks the claim
 * @returns {string[]}
 */
export function releasedIds(map, titleOf) {
  const out = [];
  for (const [id, e] of Object.entries(map || {})) {
    if (e?.status !== "false_positive") continue;
    const title = titleOf ? titleOf(id) : e.title;
    if (title != null && releaseBlock(title)) continue;
    out.push(id);
  }
  return out;
}
