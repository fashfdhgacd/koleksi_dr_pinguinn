/**
 * Owner review decisions in /pemilik "Perlu dicek" (owner rule 2026-11-02): the owner's decision wins.
 * - "show" (Tayangkan): the video is approved for good. Automatic title checks may still report a
 *   reason, but they never hide it again (Unhide beats every automatic reason in local-cache).
 *   Only the hard minor locks (explicit SD/SMP/SMA, under-18 ages, minor-lock ids) and the owner's
 *   own hide outrank it.
 * - "keep" (Tetap tahan): held for good via the owner hide list, even if a later title passes.
 * The decision is kept in the review state as a ledger next to the Unhide / owner-hide lists, so a
 * list entry lost to a stale KV read is restored from the ledger (healDecisions).
 * Plain JS, no imports: testable with node --test.
 */

/** @typedef {"show" | "keep"} Decision */
/** @typedef {{ d: Decision, at: number, title?: string }} DecisionEntry */
/** @typedef {Record<string, DecisionEntry>} DecisionMap */

/**
 * Public visibility, same order as local-cache isHiddenRaw.
 * `locked` and `reason` may be functions so the caller only computes them when needed.
 * @param {{ ownerHidden?: boolean, locked?: boolean | (() => boolean), unhidden?: boolean, reason?: string | (() => string) }} s
 * @returns {boolean} true = hidden from the public
 */
export function effectiveHidden({ ownerHidden = false, locked = false, unhidden = false, reason = "" }) {
  if (ownerHidden) return true;
  if (typeof locked === "function" ? locked() : locked) return true;
  if (unhidden) return false;
  return String((typeof reason === "function" ? reason() : reason) || "") !== "";
}

/**
 * The ledger with one decision recorded (returns a new map).
 * @param {DecisionMap | undefined} map
 * @param {string} id
 * @param {Decision} d
 * @param {{ title?: string, now?: number }} [opts]
 * @returns {DecisionMap}
 */
export function recordDecision(map, id, d, { title = "", now = Date.now() } = {}) {
  return { ...(map || {}), [id]: { d, at: now, ...(title ? { title: String(title).slice(0, 200) } : {}) } };
}

/**
 * Per id, the newer decision (by `at`) of a read and of this isolate's recent writes.
 * @param {DecisionMap | undefined} read
 * @param {DecisionMap | null | undefined} recent
 * @returns {DecisionMap}
 */
export function newerDecisions(read, recent) {
  const out = { ...(read || {}) };
  for (const [id, e] of Object.entries(recent || {})) {
    if (!out[id] || Number(out[id].at || 0) < Number(e?.at || 0)) out[id] = e;
  }
  return out;
}

/**
 * Which list a video belongs to in "Perlu dicek".
 * @param {{ decision?: DecisionEntry | null, unhidden?: boolean, ownerHidden?: boolean, legacyDecidedAt?: number | null }} s
 * @returns {"approved" | "held" | "pending"}
 */
export function reviewGroup({ decision = null, unhidden = false, ownerHidden = false, legacyDecidedAt = null }) {
  if (decision?.d === "keep" || (decision?.d !== "show" && ownerHidden)) return "held";
  if (decision?.d === "show") return "approved";
  if (unhidden && !ownerHidden) return "approved"; // Unhide from another owner screen = approved too
  if (legacyDecidedAt && unhidden) return "approved";
  if (legacyDecidedAt) return "held";
  return "pending";
}

/**
 * List entries that must be written back so the stores match the ledger (a stale read-modify-write
 * by another isolate can drop them). Locked ids are never re-shown.
 * @param {DecisionMap | undefined} decisions
 * @param {{ unhide: Record<string, unknown>, ownerHide: Record<string, unknown>, locked?: (id: string) => boolean }} lists
 * @returns {{ unhide: string[], hide: string[] }}
 */
export function healDecisions(decisions, { unhide, ownerHide, locked = () => false }) {
  const out = { unhide: /** @type {string[]} */ ([]), hide: /** @type {string[]} */ ([]) };
  for (const [id, e] of Object.entries(decisions || {})) {
    if (e?.d === "show" && !locked(id) && (!unhide[id] || ownerHide[id])) out.unhide.push(id);
    if (e?.d === "keep" && !ownerHide[id]) out.hide.push(id);
  }
  return out;
}

/**
 * Short trigger shown on a pending row: the word/rule that held it.
 * @param {string} reason e.g. 'review-pending: kata "anak ***" (...)'
 * @returns {string}
 */
export function triggerText(reason = "") {
  const s = String(reason || "").replace(/^review-pending:\s*/, "").trim();
  return s.split(/:\s/)[0].slice(0, 120);
}
