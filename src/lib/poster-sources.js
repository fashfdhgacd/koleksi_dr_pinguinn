/**
 * Poster URL helpers shared by /thumb, the owner fill, and the GitHub poster backfill.
 * Pure (no secrets, no KV). Network stays in the callers.
 *
 * Why some catalogs never got a poster:
 * - MXDrop's image is not a literal URL. The embed page packs it as MDCore.poster inside a
 *   Dean Edwards script (`//<server>.mxcontent.net/thumbs/<code>.jpg`). The HTML scraper never saw it,
 *   so fill-posters (indoav/userbokep/streamtape/putarin only) and thumb-health ("no source") skipped mx-.
 * - Vidara / g1 rows are held as embed-review, so thumb-health skipped them. The watch page still has og:image.
 * - Putarin's stored poster and the live player.image are both static.anipop.xyz, which now 404s.
 *   thumb-health treated that URL as a source, /thumb fetched it, and stored nothing.
 * - Dood's splash only appears as og:image; a Cloudflare challenge leaves dd- without a URL.
 */
import { LULU_IMG_HOST } from "./catalog/drp-hosts.js";

const DEAD_URL = /anipop\.xyz\/poster\/|cdnhlsplayer\.lat|placeholder|brand-poster|now_printing|noimage|no[-_]image|data:image/i;

/** A stored http(s) poster that must not be treated as a real image. Empty is "missing", not dead. */
export function isDeadPosterUrl(url) {
  const u = String(url || "");
  if (!/^https?:\/\//i.test(u)) return false;
  return DEAD_URL.test(u);
}

/** R2 object key the cards and /thumb read: posters/typed/<id>. */
export function typedPosterKey(id) {
  const clean = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return clean ? `posters/typed/${clean}` : "";
}

/**
 * Dean Edwards packer used by MXDrop, without eval.
 * Only replaces a number when the dictionary word is non-empty (same as the packer's `if (k[c])`).
 */
export function unpackDean(html) {
  const m = String(html || "").match(/}\(\s*'([^']*)'\s*,\s*\d+\s*,\s*\d+\s*,\s*'([^']*)'\.split\('\|'\)/);
  if (!m) return "";
  const words = m[2].split("|");
  return m[1].replace(/\b(\d+)\b/g, (raw) => {
    const word = words[Number(raw)];
    return word ? word : raw;
  });
}

function https(url) {
  const u = String(url || "").trim();
  if (u.startsWith("//")) return `https:${u}`;
  return /^https?:\/\//i.test(u) ? u : "";
}

/** MXDrop embed HTML -> poster jpg and the signed mp4, or empty strings. */
export function mxdropFromHtml(html) {
  const plain = unpackDean(html);
  const poster = plain.match(/\.poster="([^"]+)"/);
  const file = plain.match(/\.wurl="([^"]+)"/);
  return { poster: https(poster?.[1] || ""), file: https(file?.[1] || "") };
}

/** og:image / video poster from an embed or watch page. Skips logos and placeholders. */
export function metaImage(html) {
  const s = String(html || "");
  const pats = [
    /property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i,
    /<video[^>]+poster=["'](https?:\/\/[^"']+)["']/i,
  ];
  for (const re of pats) {
    const m = s.match(re);
    const url = m ? https(m[1].replace(/&amp;/g, "&")) : "";
    if (url && !DEAD_URL.test(url) && !/logo|favicon|sprite|avatar|icon/i.test(url)) return url;
  }
  return "";
}

export function luluPosterUrls(code) {
  const c = String(code || "");
  if (!/^[A-Za-z0-9]{4,40}$/.test(c)) return [];
  return [`https://${LULU_IMG_HOST}/${c}_xt.jpg`, `https://${LULU_IMG_HOST}/${c}.jpg`];
}

export function bysePosterUrls(code) {
  const c = String(code || "");
  if (!/^[A-Za-z0-9]{4,40}$/.test(c)) return [];
  return [`https://img-place.com/${c}_xt.jpg`, `https://img-place.com/${c}_t.jpg`];
}

/** Prefixes /thumb can resolve from the id alone (no catalog lookup, no new env). */
export function workerCanResolve(id) {
  return /^(?:mx|dd|lu|by)-[A-Za-z0-9]{4,40}$/.test(String(id || ""));
}

export function hostKind(item) {
  const id = String(item?.id || "");
  const blob = `${item?.source || ""} ${item?.embed || ""} ${item?.direct || ""}`;
  if (id.startsWith("mx-") || /mxdrop/i.test(blob)) return "mx";
  if (id.startsWith("dd-") || /doodstream|playmogo|\bdood\b/i.test(blob)) return "dd";
  if (id.startsWith("lu-") || /lulustream|luluvdo|luluvid|lplaygo/i.test(blob)) return "lu";
  if (id.startsWith("by-") || /\bbyse\b/i.test(blob)) return "by";
  if (id.startsWith("vd-") || id.startsWith("g1") || /vidara/i.test(blob)) return "vidara";
  if (/indoav/i.test(blob)) return "indoav";
  if (/userbokep/i.test(blob)) return "userbokep";
  if (/putarin|puterin/i.test(blob)) return "putarin";
  if (/streamtape|strcloud/i.test(blob)) return "tape";
  if (/videy/i.test(blob)) return "videy";
  return "";
}

const SKIP_HIDDEN = /school|teacher-student|detector-review|dead-videy/i;

/** Catalog rows the backfill may poster. Safety holds and dead Videy files stay out. */
export function includeItem(item) {
  if (!item?.id || !(item.embed || item.direct)) return false;
  if (hostKind(item) === "videy") return false;
  if (item.hidden && SKIP_HIDDEN.test(String(item.hidden_reason || ""))) return false;
  return true;
}

/**
 * Newest visible rows first: homepage / Terbaru (date), then mx- dd- g1/vidara,
 * then IndoAV and UserBokep, then Putarin.
 */
export function posterRank(item) {
  const kind = hostKind(item);
  const band = kind === "mx" || kind === "dd" || kind === "vidara" ? 0 : kind === "indoav" || kind === "userbokep" ? 1 : kind === "putarin" ? 2 : 3;
  const date = String(item?.updated_at || item?.date || "");
  return { band, date };
}

export function fileCode(item) {
  const id = String(item?.id || "");
  const prefixed = id.match(/^(?:mx|dd|lu|by|vd)-([A-Za-z0-9]{4,40})$/);
  if (prefixed) return prefixed[1];
  if (item?.code && /^[A-Za-z0-9]{4,40}$/.test(String(item.code))) return String(item.code);
  const fromUrl = String(item?.embed || item?.direct || "").match(/\/(?:e|v|d|f)\/([A-Za-z0-9]{4,40})/);
  return fromUrl ? fromUrl[1] : "";
}

/** Protocol-relative HLS lines (`//host/storage/.../segN`) become https URLs. */
export function playlistSegments(text, playlistUrl) {
  let base;
  try {
    base = new URL(playlistUrl);
  } catch {
    return [];
  }
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || raw.startsWith("#")) continue;
    if (raw.startsWith("//")) out.push(`https:${raw}`);
    else {
      try {
        out.push(new URL(raw, base).href);
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

/** Prefer a frame a few seconds in; short clips still have an early segment. */
export function segmentPicks(urls) {
  const list = Array.isArray(urls) ? urls : [];
  const order = [2, 4, 1, 0, 6, 3];
  const out = [];
  for (const i of order) if (list[i] && !out.includes(list[i])) out.push(list[i]);
  if (!out.length && list[0]) out.push(list[0]);
  return out.slice(0, 4);
}

/**
 * A JPEG that is almost one colour (bytes per pixel). Same idea as thumb-health:
 * flat "NOW PRINTING" / black frames compress far below a real picture.
 */
export function jpegTooFlat(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf || []);
  if (!(b[0] === 0xff && b[1] === 0xd8)) return false;
  let width = 0;
  let height = 0;
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return false;
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xc3) {
      height = (b[i + 5] << 8) | b[i + 6];
      width = (b[i + 7] << 8) | b[i + 8];
      break;
    }
    i += 2 + len;
  }
  return Boolean(width * height > 40000 && b.byteLength / (width * height) < 0.012);
}
