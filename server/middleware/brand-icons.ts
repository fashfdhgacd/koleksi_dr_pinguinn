/**
 * Brand icons (favicon.ico, favicon-32.png, apple-touch-icon.png, PWA 192/512 + maskable) served from
 * base64 data in src/lib/brand-icons-data.ts. These paths have no file in public/, so they reach the
 * Worker; everything else passes through untouched.
 */
import { BRAND_ICONS } from "../../src/lib/brand-icons-data";

interface IconEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

const decoded = new Map<string, Uint8Array>();

function bytesFor(path: string, b64: string): Uint8Array {
  let bytes = decoded.get(path);
  if (!bytes) {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    decoded.set(path, bytes);
  }
  return bytes;
}

export default async function brandIconsMiddleware(
  event: IconEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const icon = BRAND_ICONS[event.url.pathname];
  const method = (event.req.method || "GET").toUpperCase();
  if (!icon || (method !== "GET" && method !== "HEAD")) return next();
  const bytes = bytesFor(event.url.pathname, icon.b64);
  return new Response(method === "HEAD" ? null : bytes, {
    headers: {
      "content-type": icon.type,
      "content-length": String(bytes.length),
      "cache-control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
