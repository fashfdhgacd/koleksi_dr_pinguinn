/**
 * Single owner-key check for every owner endpoint (/api/owner-tools, /api/online owner view,
 * /api/analytics/overview|hourly, GET /api/telegram).
 *
 * - The key is read ONLY from the `x-online-key` header (or an explicit JSON body field passed in
 *   by the caller). It is never read from the URL query string: URLs end up in browser history,
 *   proxy/CDN logs and Referer headers.
 * - Comparison is constant-time: both sides are hashed with SHA-256 and the digests are compared
 *   byte by byte without an early exit, so response timing does not reveal how much of a guess
 *   matched (and the key length is not leaked either).
 */

export const OWNER_KEY_HEADER = "x-online-key";

/** Configured owner secret (same env precedence as before: ONLINE_VIEW_SECRET, then OWNER/PEMILIK). */
export function ownerSecret(): string {
  const a = (process.env.ONLINE_VIEW_SECRET || "").trim();
  if (a) return a;
  return (process.env.OWNER_SECRET || process.env.PEMILIK_SECRET || "").trim();
}

async function sha256(text: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(buf);
}

/** Constant-time string equality (hash both, compare fixed-length digests without early exit). */
export async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([sha256(String(a)), sha256(String(b))]);
  let diff = da.length ^ db.length;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ (db[i] ?? 0);
  return diff === 0;
}

/** True when `key` matches the configured owner secret. Empty secret or empty key → false. */
export async function isOwnerKey(key: string | null | undefined): Promise<boolean> {
  const secret = ownerSecret();
  const given = String(key || "").trim();
  if (!secret || !given) return false;
  return timingSafeEqualStr(given, secret);
}

/** Owner key from the request header only (never the URL), with an optional JSON-body fallback. */
export function ownerKeyFrom(request: Request, bodyKey?: unknown): string {
  const header = (request.headers.get(OWNER_KEY_HEADER) || "").trim();
  if (header) return header;
  return typeof bodyKey === "string" ? bodyKey.trim() : "";
}

/** Owner check for a request: header `x-online-key` (or the given body key). */
export async function isOwnerRequest(request: Request, bodyKey?: unknown): Promise<boolean> {
  return isOwnerKey(ownerKeyFrom(request, bodyKey));
}
