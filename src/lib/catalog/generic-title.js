/**
 * "Generic" titles = not the video's real title: the bot's numbered fallback for Lulu/Dood/Byse
 * ("Koleksi Dr. Pinguin Bokep 437"), its interim "Bokep Indo Pilihan <code>", records the bot marked
 * titleAuto, and source page/file placeholders (title-brand.js isPlaceholderTitle).
 *
 * Only these may be replaced by an automatically found title (catalog merge, data/auto-meta.json,
 * the /pemilik sweep). A real title is never overwritten. Videy is out of scope on purpose: its
 * titles stay as they are (no remote title source); callers skip Videy before asking.
 * Plain JS so the Worker, the bot and the scripts share it.
 */
import { cleanUploadTitle, isPlaceholderTitle } from "../bot/title-brand.js";

export const DRP_NUMBERED_TITLE_RE = /^Koleksi Dr\. Pinguin Bokep \d+\b/i;
export const DRP_INTERIM_TITLE_RE = /^Bokep Indo Pilihan [A-Za-z0-9]+\b/i;

/** Mark stored in data/auto-meta.json (`none`) when the platform gave no real title. */
export const NO_SOURCE = "sumber-nggak-ngasih";

/**
 * True when `title` is a stand-in, not a real title. `rec` (optional) is the stored record.
 * @param {unknown} title
 * @param {any} [rec]
 */
export function isGenericTitle(title, rec) {
  if (rec && rec.titleAuto === true) return true;
  const t = String(title ?? "").trim();
  if (!t) return true;
  if (DRP_NUMBERED_TITLE_RE.test(t) || DRP_INTERIM_TITLE_RE.test(t)) return true;
  return isPlaceholderTitle(cleanUploadTitle(t));
}

/**
 * A found title worth storing: non-empty, not itself generic.
 * @param {unknown} title
 */
export function isRealTitle(title) {
  const t = String(title ?? "").trim();
  return t.length >= 3 && !isGenericTitle(t);
}
