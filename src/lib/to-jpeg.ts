/**
 * Convert a poster to JPEG for share cards (X / Facebook / Google).
 * WebP and PNG are transcoded once; JPEG is returned as-is. No KV, no new env.
 */
import { Image } from "imagescript";

export const OG_JPEG_MAX_BYTES = 5 * 1024 * 1024;
export const OG_JPEG_MIN_BYTES = 32;

function asBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

function sniff(bytes: Uint8Array): string {
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.byteLength >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.byteLength >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";
  return "";
}

/** JPEG bytes, or null when the input is not a usable image. */
export async function toJpeg(buf: ArrayBuffer | Uint8Array | null | undefined, quality = 85): Promise<Uint8Array | null> {
  if (!buf) return null;
  const bytes = asBytes(buf);
  if (bytes.byteLength < OG_JPEG_MIN_BYTES || bytes.byteLength > OG_JPEG_MAX_BYTES) return null;
  const type = sniff(bytes);
  if (type === "image/jpeg") return bytes;
  if (type !== "image/webp" && type !== "image/png") return null;
  try {
    const img = await Image.decode(bytes);
    if (!img?.width || !img?.height) return null;
    const jpeg = await img.encodeJPEG(quality);
    const out = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg);
    if (out.byteLength < OG_JPEG_MIN_BYTES || out.byteLength > OG_JPEG_MAX_BYTES) return null;
    if (out[0] !== 0xff || out[1] !== 0xd8) return null;
    return out;
  } catch {
    return null;
  }
}

export function isJpegBytes(buf: ArrayBuffer | Uint8Array | null | undefined): boolean {
  if (!buf) return false;
  const b = asBytes(buf);
  return b.byteLength >= OG_JPEG_MIN_BYTES && b[0] === 0xff && b[1] === 0xd8;
}
