/**
 * "Koleksi Dr. Pinguin Bokep" (/kategori/bokep): videos the owner uploads to his own accounts on
 * LuluStream, DoodStream and Byse. Shared by the site catalog (slugOf, hostLabel) and the Telegram
 * bot (parse.js). Plain JS so both sides import the same lists.
 *
 * - Every item from these hosts lands in category "bokep" (like Videy -> "videy").
 * - Bot ids carry a prefix (lu- / dd- / by-) so they never clash with other hosts' ids
 *   (R2 thumbnail keys posters/typed/<id>, /watch/<id>).
 * - Byse gives every account its own embed domain; known ones are listed here, any other domain is
 *   accepted by the bot when /e/<code> answers Byse's public /api/videos/<code>/embed/details.
 *   Add a new Byse domain to BYSE_DOMAINS when the owner gets one (no env var needed).
 */

export const DRP_CATEGORY = "bokep";

export const DRP_SOURCES = { lulu: "LuluStream", dood: "DoodStream", byse: "Byse" };

export const DRP_ID_PREFIX = { lulu: "lu-", dood: "dd-", byse: "by-" };

/**
 * LuluStream player + panel domains. luluvdo.com is the embed host (lulustream.com/e/ redirects there).
 * Any lulu<v…|stream…>.<tld> mirror also matches (LULU_MIRROR_RE), e.g. luluvido.com (share links
 * https://luluvido.com/d/<code>, seen 2026-10-19).
 */
export const LULU_DOMAINS = [
  "luluvdo.com",
  "luluvdoo.com",
  "luluvido.com",
  "lulustream.com",
  "lulustream.co",
  "luluvid.com",
  "lulu.st",
];

/** DoodStream rotates mirrors; dood.to / doodstream.com currently redirect to playmogo.com. */
export const DOOD_DOMAINS = [
  "doodstream.com",
  "dood.to",
  "dood.la",
  "dood.so",
  "dood.pm",
  "dood.wf",
  "dood.re",
  "dood.yt",
  "dood.ws",
  "dood.sh",
  "dood.cx",
  "dood.li",
  "dood.watch",
  "dood.stream",
  "doods.pro",
  "dooood.com",
  "d000d.com",
  "d0000d.com",
  "d0o0d.com",
  "do0od.com",
  "ds2play.com",
  "ds2video.com",
  "playmogo.com",
  "vidply.com",
  "myvidplay.com",
  "doply.net",
  "vide0.net",
];

/** Byse panel + embed domains seen so far (any byse*.tld also matches). */
export const BYSE_DOMAINS = [
  "byse.sx",
  "api.byse.sx",
  "bysezejataos.com",
  "bysebuho.com",
  "bysevepoin.com",
  "byseqekaho.com",
  "bysezoxexe.com",
];

/** LuluStream mirror family: luluvdo / luluvido / luluvid / lulustream on any TLD (and subdomains). */
const LULU_MIRROR_RE = /^(?:[a-z0-9-]+\.)*lulu(?:v[a-z0-9]*|stream[a-z0-9]*)\.[a-z]{2,}$/;

/** @param {unknown} hostname */
function bareHost(hostname) {
  return String(hostname || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

/** @param {string} host @param {string[]} list */
function inList(host, list) {
  return list.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * "lulu" | "dood" | "byse" | "" for a hostname (no network).
 * @param {unknown} hostname
 * @returns {"lulu" | "dood" | "byse" | ""}
 */
export function drpKindOfHost(hostname) {
  const h = bareHost(hostname);
  if (!h) return "";
  if (inList(h, LULU_DOMAINS) || LULU_MIRROR_RE.test(h)) return "lulu";
  if (inList(h, DOOD_DOMAINS) || /^(?:[a-z0-9-]+\.)*dood[a-z0-9]*\.[a-z]{2,}$/.test(h)) return "dood";
  if (inList(h, BYSE_DOMAINS) || /^(?:[a-z0-9-]+\.)*byse[a-z0-9]*\.[a-z]{2,}$/.test(h)) return "byse";
  return "";
}

/**
 * Same, for a full URL.
 * @param {unknown} url
 * @returns {"lulu" | "dood" | "byse" | ""}
 */
export function drpKindOfUrl(url) {
  const key = String(url || "");
  const hit = kindByUrl.get(key);
  if (hit !== undefined) return hit;
  /** @type {"lulu" | "dood" | "byse" | ""} */
  let kind = "";
  try {
    kind = drpKindOfHost(new URL(key).hostname);
  } catch {
    kind = "";
  }
  // Pure function of the URL string: memo per isolate (one URL parse per embed/direct, not one per
  // call; a catalog build asks several times per item). Bounded so it can never grow without limit.
  if (kindByUrl.size >= KIND_MEMO_MAX) kindByUrl.clear();
  kindByUrl.set(key, kind);
  return kind;
}

/** @type {Map<string, "lulu" | "dood" | "byse" | "">} */
const kindByUrl = new Map();
const KIND_MEMO_MAX = 50_000;

/**
 * Kind from a stored catalog item: source label first (Byse custom domains), then embed/direct host.
 * @param {{ source?: unknown; embed?: unknown; direct?: unknown } | null | undefined} item
 * @returns {"lulu" | "dood" | "byse" | ""}
 */
export function drpKindOfItem(item) {
  if (!item || typeof item !== "object") return "";
  const src = String(item.source || "").trim().toLowerCase();
  if (src === "lulustream") return "lulu";
  if (src === "doodstream") return "dood";
  if (src === "byse") return "byse";
  return drpKindOfUrl(item.embed) || drpKindOfUrl(item.direct);
}

/**
 * File code from a host URL: /e/<code>, /d/<code>, /v/<code>, /f/<code>, or /<code>(.html).
 * @param {unknown} url
 * @returns {string}
 */
export function drpCodeFromUrl(url) {
  let u;
  try {
    u = new URL(String(url || ""));
  } catch {
    return "";
  }
  const path = u.pathname || "";
  const m = path.match(/^\/(?:e|d|v|f|embed|watch)\/([A-Za-z0-9]{4,40})(?:[/?#.]|$)/i);
  if (m) return m[1];
  const last = path.match(/^\/([A-Za-z0-9]{6,40})(?:\.html)?\/?$/i);
  return last ? last[1] : "";
}
