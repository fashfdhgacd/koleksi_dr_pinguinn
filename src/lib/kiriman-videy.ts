/**
 * Visitor Videy submissions from videyy.icu. Pending items live in the existing
 * ANALYTICS_KV binding (one queue key, plus one per-IP counter touched only when
 * a new item is actually stored). Nothing here is public until the owner approves
 * it in /pemilik through the same upload path as a Videy paste.
 */

export const KIRIMAN_QUEUE_KEY = "kiriman:videy:v1";
export const KIRIMAN_IP_PREFIX = "kiriman:videy:ip:";
export const KIRIMAN_PENDING_CAP = 300;
export const KIRIMAN_IP_PER_DAY = 10;
export const KIRIMAN_IP_TTL_SEC = 86400;
export const KIRIMAN_SITE = "videyy.icu";

/** Videy file ids as the catalog stores them: 9 chars, last is 1 (mp4) or 2 (mov). */
export const VIDEY_ID_RE = /^[A-Za-z0-9]{8}[12]$/;

export type KirimanItem = {
  id: string;
  url: string;
  title: string;
  site: typeof KIRIMAN_SITE;
  at: number;
};

const CDN_HOST = /^cdn\d*\.videy\.co$/i;

/** Canonical watch URL for a Videy id. */
export function canonicalVideyUrl(id: string): string {
  return `https://videy.co/v/?id=${id}`;
}

/**
 * Accept only videy.co / www.videy.co watch links and a direct cdn.videy.co file.
 * Returns the id with its original casing, or null.
 */
export function normalizeVideyUrl(raw: unknown): { id: string; url: string } | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 300) return null;
  if (/[\u0000-\u001F\u007F]/.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "443" && u.port !== "80") return null;
  const host = u.hostname.toLowerCase();
  let id = "";
  if (host === "videy.co" || host === "www.videy.co") {
    id = u.searchParams.get("id") || "";
  } else if (CDN_HOST.test(host)) {
    const m = u.pathname.match(/^\/([A-Za-z0-9]{8}[12])\.(mp4|mov)$/i);
    if (!m) return null;
    id = m[1];
  } else {
    return null;
  }
  if (!VIDEY_ID_RE.test(id)) return null;
  return { id, url: canonicalVideyUrl(id) };
}

/** Drop tags and control characters, collapse whitespace, cap at 120. */
export function sanitizeKirimanTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw;
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/<[^>]*>/g, "");
    if (next === s) break;
    s = next;
  }
  s = s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, 120);
}

export function honeypotTripped(hp: unknown): boolean {
  if (typeof hp === "string") return hp.length > 0;
  return hp != null && hp !== false;
}

export type PublicBody =
  | { kind: "drop" }
  | { kind: "invalid" }
  | { kind: "ready"; id: string; url: string; title: string };

/** Pre-storage check. Honeypot wins so a filled trap never looks like a validation error. */
export function inspectPublicBody(body: unknown): PublicBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { kind: "invalid" };
  const rec = body as Record<string, unknown>;
  if (honeypotTripped(rec.hp)) return { kind: "drop" };
  if (rec.site !== KIRIMAN_SITE) return { kind: "invalid" };
  const norm = normalizeVideyUrl(rec.url);
  if (!norm) return { kind: "invalid" };
  return { kind: "ready", id: norm.id, url: norm.url, title: sanitizeKirimanTitle(rec.title) };
}

export function duplicateKind(id: string, catalogIds: Iterable<string>, pendingIds: Iterable<string>): "pending" | "catalog" | null {
  const want = id.toLowerCase();
  for (const pending of pendingIds) {
    if (String(pending).toLowerCase() === want) return "pending";
  }
  for (const catalog of catalogIds) {
    if (String(catalog).toLowerCase() === want) return "catalog";
  }
  return null;
}

/** Ids a catalog row contributes (its own id, plus a Videy id embedded in the file URL). */
export function idsFromCatalogItem(item: { id?: unknown; embed?: unknown; direct?: unknown } | null | undefined): string[] {
  if (!item) return [];
  const out: string[] = [];
  const id = String(item.id || "");
  if (VIDEY_ID_RE.test(id)) out.push(id);
  const embed = String(item.embed || "");
  const fromEmbed = embed.match(/[?&]id=([A-Za-z0-9]{8}[12])\b/);
  if (fromEmbed) out.push(fromEmbed[1]);
  const direct = String(item.direct || "");
  const fromFile = direct.match(/\/([A-Za-z0-9]{8}[12])\.(?:mp4|mov)\b/i);
  if (fromFile) out.push(fromFile[1]);
  return out;
}

export type KirimanDecision = "duplicate" | "rate_limited" | "pending";

/**
 * What a valid submission should answer, before any write.
 * `ipCount` is the number already stored for this IP in the current window.
 */
export function decideKiriman(input: {
  id: string;
  pendingIds: Iterable<string>;
  catalogIds: Iterable<string>;
  pendingCount: number;
  ipCount: number;
}): KirimanDecision {
  if (duplicateKind(input.id, input.catalogIds, input.pendingIds)) return "duplicate";
  if (input.pendingCount >= KIRIMAN_PENDING_CAP) return "rate_limited";
  if (input.ipCount >= KIRIMAN_IP_PER_DAY) return "rate_limited";
  return "pending";
}

export function parseQueue(raw: string | null | undefined): KirimanItem[] | null {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return null;
    const items: KirimanItem[] = [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const id = String(rec.id || "");
      if (!VIDEY_ID_RE.test(id)) continue;
      const at = Number(rec.at);
      items.push({
        id,
        url: canonicalVideyUrl(id),
        title: sanitizeKirimanTitle(rec.title),
        site: KIRIMAN_SITE,
        at: Number.isFinite(at) ? at : 0,
      });
    }
    items.sort((a, b) => b.at - a.at);
    return items;
  } catch {
    return null;
  }
}

export function isKirimanId(id: string): boolean {
  return VIDEY_ID_RE.test(id);
}

/**
 * Owner-upload replies. The batch summary always starts with a checkmark ("✅ 0 dibuat"),
 * so a bare checkmark is not success. Per-item success uses "✅ <id> —".
 */
export function classifyUploadResult(lines: string[], createdCount: number): "saved" | "exists" | "failed" {
  const text = lines.join("\n");
  const exists = /\(sudah ada\)/i.test(text);
  const saved =
    createdCount > 0 ||
    /🕒/.test(text) ||
    /✅\s+\S+\s+—/.test(text) ||
    /ditahan|disembunyikan/i.test(text);
  if (saved) return "saved";
  if (exists) return "exists";
  return "failed";
}
