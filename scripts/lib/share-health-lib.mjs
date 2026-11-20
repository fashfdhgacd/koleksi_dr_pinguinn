/**
 * Pure helpers for the share/OG health check (site-health.mjs).
 * Flags missing meta, off-site og:image, and images that are not a 200 JPEG.
 */

export const BOT_UAS = {
  Twitterbot: "Twitterbot/1.0",
  facebookexternalhit: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};

const META_RE = /<meta\s[^>]*>/gi;
const ATTR_RE = /([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function metaTags(html) {
  const out = [];
  const text = String(html || "");
  for (const m of text.matchAll(META_RE)) {
    const tag = m[0];
    const attrs = {};
    for (const a of tag.matchAll(ATTR_RE)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? "";
    const key = attrs.property || attrs.name || "";
    const content = attrs.content || "";
    if (key) out.push({ key: key.toLowerCase(), content });
  }
  return out;
}

export function ogImageOf(html) {
  const tags = metaTags(html);
  const pick = (name) => tags.find((t) => t.key === name)?.content?.trim() || "";
  return {
    og: pick("og:image") || pick("og:image:secure_url"),
    twitter: pick("twitter:image"),
    type: pick("og:image:type"),
    card: pick("twitter:card"),
  };
}

export function isSameOrigin(url, origin) {
  try {
    const u = new URL(url);
    const o = new URL(origin);
    return u.protocol === "https:" && u.origin === o.origin;
  } catch {
    return false;
  }
}

/**
 * @returns {string} empty when the image is a usable same-origin JPEG; otherwise a short reason
 */
export function shareImageProblem({ pageUrl, origin, og, imageStatus, imageType, imageBytes, sniff }) {
  const url = og?.og || og?.twitter || "";
  if (!url) return `${pageUrl}: missing og:image`;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `${pageUrl}: og:image is not an absolute URL (${url})`;
  }
  if (parsed.protocol !== "https:") return `${pageUrl}: og:image is not https (${url})`;
  if (parsed.origin !== new URL(origin).origin) return `${pageUrl}: og:image is an external host (${parsed.host})`;
  if (imageStatus !== 200) return `${pageUrl}: og:image HTTP ${imageStatus} (${parsed.pathname})`;
  if (sniff && sniff !== "jpeg") return `${pageUrl}: og:image bytes are ${sniff}, not JPEG (${parsed.pathname})`;
  const type = String(imageType || "").split(";")[0].trim().toLowerCase();
  if (type && type !== "image/jpeg" && type !== "image/jpg") {
    return `${pageUrl}: og:image content-type ${type} (${parsed.pathname})`;
  }
  if (imageBytes != null && (imageBytes < 32 || imageBytes > 5 * 1024 * 1024)) {
    return `${pageUrl}: og:image size ${imageBytes} (${parsed.pathname})`;
  }
  return "";
}

export function sniffMagic(buf) {
  if (!buf || buf.length < 4) return "empty";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return "webp";
  return "other";
}

export function requiredSitemapPaths() {
  return ["/cari/bokep-indoav-terbaru", "/cari/bokep-userbokep-indo", "/cari/bokep-malaysia-rempit"];
}
