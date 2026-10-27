/**
 * One image validator for every place that stores a poster (R2 via /thumb, the bot's poster lookup,
 * the poster workflows). Rejects known placeholders (md5 blocklist in image-blocklist.json, shared
 * with scripts/thumb-health.mjs), tiny files, non-images, and redirects to now_printing/no-image URLs.
 * Single-colour detection needs an image decoder, so it only runs in the GitHub workflow.
 */
import blocklist from "@/lib/image-blocklist.json";

export const PLACEHOLDER_MD5: Record<string, string> = blocklist.md5;
export const MIN_IMAGE_BYTES: number = blocklist.minBytes;
const BAD_URL = new RegExp(blocklist.urlPattern, "i");

export function isPlaceholderUrl(url: unknown): boolean {
  return BAD_URL.test(String(url || ""));
}

export function isPlaceholderMd5(md5: unknown): boolean {
  const h = String(md5 || "").replace(/"/g, "").toLowerCase();
  return Boolean(h && Object.prototype.hasOwnProperty.call(PLACEHOLDER_MD5, h));
}

export function sniffImageType(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf.slice(0, 16));
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return "image/webp";
  return "";
}

async function md5Hex(buf: ArrayBuffer): Promise<string> {
  try {
    // Workers support MD5 in WebCrypto; elsewhere this throws and the size/type checks still apply.
    const d = await crypto.subtle.digest("MD5", buf);
    return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

export type ImageVerdict = { ok: true; type: string } | { ok: false; reason: string };

/** Validate fetched poster bytes before they are stored anywhere. `finalUrl` = response.url after redirects. */
export async function checkImage(buf: ArrayBuffer | null, finalUrl = ""): Promise<ImageVerdict> {
  if (isPlaceholderUrl(finalUrl)) return { ok: false, reason: "placeholder-url" };
  if (!buf || buf.byteLength < MIN_IMAGE_BYTES) return { ok: false, reason: "too-small" };
  const type = sniffImageType(buf);
  if (!type) return { ok: false, reason: "not-image" };
  if (isPlaceholderMd5(await md5Hex(buf))) return { ok: false, reason: "placeholder-md5" };
  return { ok: true, type };
}

/** Fetch a poster URL and validate it (no storing). Used by the bot before it records a poster URL. */
export async function fetchValidImage(url: string, referer = "", timeoutMs = 6000): Promise<ImageVerdict> {
  if (!/^https:\/\//i.test(url) || isPlaceholderUrl(url)) return { ok: false, reason: "placeholder-url" };
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "kdp-poster/1", ...(referer ? { referer } : {}) },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    return await checkImage(await res.arrayBuffer().catch(() => null), res.url || url);
  } catch {
    return { ok: false, reason: "fetch-failed" };
  }
}
