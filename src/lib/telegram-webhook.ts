/**
 * Telegram webhook hardening for /api/telegram.
 *
 * - Secret token: HMAC-SHA256(key = BOT_TOKEN, message = "kdp-telegram-webhook-v1"), hex. Derived at
 *   runtime, so no extra env var is needed and rotating BOT_TOKEN rotates the secret too. Telegram
 *   sends it back on every update in `X-Telegram-Bot-Api-Secret-Token` once setWebhook was called
 *   with `secret_token`.
 * - setWebhook / getWebhookInfo are called by the Worker itself (owner-key protected action in
 *   /api/owner-tools, plus a throttled self-heal when an update arrives without the right header and
 *   the webhook already points at this site). The bot token is only ever used inside the Telegram API
 *   URL; it is never returned, logged or included in error text (see redactToken).
 */
import { optionalKvGet, optionalKvPut } from "@/lib/owner-analytics-shared";
import { timingSafeEqualStr } from "@/lib/owner-auth";

export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";
export const WEBHOOK_PATH = "/api/telegram";
export const WEBHOOK_URL = `https://koleksidrpinguin.com${WEBHOOK_PATH}`;

/** Hosts that serve this Worker; a webhook URL on one of them + WEBHOOK_PATH is "ours". */
const OUR_HOSTS = new Set([
  "koleksidrpinguin.com",
  "www.koleksidrpinguin.com",
  "koleksidrpinguin.site",
  "www.koleksidrpinguin.site",
  "koleksi-dr-pinguinn.readmi559.workers.dev",
]);

const SECRET_LABEL = "kdp-telegram-webhook-v1";
const KV_LAST_OK = "tg:webhook:last-ok:v1";
const KV_LAST_SETUP = "tg:webhook:last-setup:v1";

export function botToken(): string {
  return String(process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

/** Remove the bot token (and anything shaped like one) from text before it is logged or returned. */
export function redactToken(text: unknown, token = botToken()): string {
  let s = String(text ?? "");
  if (token) s = s.split(token).join("[redacted]");
  return s.replace(/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, "[redacted]").slice(0, 300);
}

let secretCache: { token: string; secret: string } | null = null;

/** Webhook secret derived from the bot token (64 hex chars, allowed charset for secret_token). */
export async function webhookSecret(token = botToken()): Promise<string> {
  if (!token) return "";
  if (secretCache && secretCache.token === token) return secretCache.secret;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SECRET_LABEL));
  const secret = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  secretCache = { token, secret };
  return secret;
}

/** Constant-time comparison of the received secret header with the expected secret. */
export async function timingSafeSecretMatch(given: string, expected: string): Promise<boolean> {
  if (!given || !expected) return false;
  return timingSafeEqualStr(given, expected);
}

export function isOurWebhookUrl(url: unknown): boolean {
  try {
    const u = new URL(String(url || ""));
    if (u.protocol !== "https:") return false;
    if (!OUR_HOSTS.has(u.hostname.toLowerCase())) return false;
    return u.pathname.replace(/\/+$/, "") === WEBHOOK_PATH;
  } catch {
    return false;
  }
}

type TgResult<T> = { ok: true; result: T } | { ok: false; error: string; status?: number };

async function tgApi<T>(method: string, payload?: Record<string, unknown>): Promise<TgResult<T>> {
  const token = botToken();
  if (!token) return { ok: false, error: "bot_token_missing" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; result?: T; description?: string }
      | null;
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        status: res.status,
        error: redactToken(data?.description || `http_${res.status}`, token),
      };
    }
    return { ok: true, result: data.result as T };
  } catch (err) {
    return { ok: false, error: redactToken(err instanceof Error ? err.message : "network_error", token) };
  }
}

type RawWebhookInfo = {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_error_date?: number;
  max_connections?: number;
  allowed_updates?: string[];
};

/** Webhook info safe to show the owner (no token, no secret). */
export type WebhookInfo = {
  url: string;
  isOurs: boolean;
  pendingUpdateCount: number;
  lastErrorDate: string | null;
  lastErrorMessage: string | null;
  maxConnections: number | null;
  allowedUpdates: string[] | null;
};

function isoFromUnix(sec: unknown): string | null {
  const n = Number(sec);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

function cleanInfo(raw: RawWebhookInfo): WebhookInfo {
  return {
    url: String(raw.url || ""),
    isOurs: isOurWebhookUrl(raw.url),
    pendingUpdateCount: Number(raw.pending_update_count || 0),
    lastErrorDate: isoFromUnix(raw.last_error_date),
    lastErrorMessage: raw.last_error_message ? redactToken(raw.last_error_message) : null,
    maxConnections: typeof raw.max_connections === "number" ? raw.max_connections : null,
    allowedUpdates: Array.isArray(raw.allowed_updates) ? raw.allowed_updates.map(String) : null,
  };
}

async function rawWebhookInfo(): Promise<TgResult<RawWebhookInfo>> {
  return tgApi<RawWebhookInfo>("getWebhookInfo");
}

export async function getWebhookInfo(): Promise<{ ok: boolean; info?: WebhookInfo; error?: string }> {
  const r = await rawWebhookInfo();
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, info: cleanInfo(r.result) };
}

/** Last time a correctly signed update from an allowed user was accepted (KV, ISO string). */
export async function lastVerifiedUpdateAt(): Promise<string | null> {
  return optionalKvGet(KV_LAST_OK);
}

export async function lastSetupAt(): Promise<string | null> {
  return optionalKvGet(KV_LAST_SETUP);
}

let lastOkWrite = 0;
/** Record (throttled: max once per 10 min per isolate) that a verified update was accepted. */
export async function markVerifiedUpdate(): Promise<void> {
  const now = Date.now();
  if (now - lastOkWrite < 10 * 60_000) return;
  lastOkWrite = now;
  await optionalKvPut(KV_LAST_OK, new Date(now).toISOString(), 60 * 60 * 24 * 30);
}

/**
 * setWebhook with the derived secret_token. Keeps the existing allowed_updates / max_connections and
 * never drops pending updates (updates rejected with 401 before the secret was set are re-delivered).
 * `url` defaults to WEBHOOK_URL; it must be one of our own webhook URLs.
 */
export async function setWebhookWithSecret(
  url: string = WEBHOOK_URL,
  keep?: { allowedUpdates?: string[] | null; maxConnections?: number | null },
): Promise<{ ok: boolean; error?: string }> {
  if (!isOurWebhookUrl(url)) return { ok: false, error: "url_not_ours" };
  const secret = await webhookSecret();
  if (!secret) return { ok: false, error: "bot_token_missing" };
  const payload: Record<string, unknown> = {
    url,
    secret_token: secret,
    drop_pending_updates: false,
  };
  if (keep?.allowedUpdates && keep.allowedUpdates.length) payload.allowed_updates = keep.allowedUpdates;
  if (keep?.maxConnections) payload.max_connections = keep.maxConnections;
  const r = await tgApi<boolean>("setWebhook", payload);
  if (!r.ok) return { ok: false, error: r.error };
  await optionalKvPut(KV_LAST_SETUP, new Date().toISOString(), 60 * 60 * 24 * 365);
  return { ok: true };
}

/**
 * Owner action: (re)install the webhook on WEBHOOK_URL with the secret, then read it back.
 * Existing allowed_updates / max_connections are preserved.
 */
export async function setupWebhook(): Promise<{
  ok: boolean;
  error?: string;
  info?: WebhookInfo;
  before?: WebhookInfo;
}> {
  const prev = await rawWebhookInfo();
  const before = prev.ok ? cleanInfo(prev.result) : undefined;
  const set = await setWebhookWithSecret(WEBHOOK_URL, {
    allowedUpdates: before?.allowedUpdates,
    maxConnections: before?.maxConnections,
  });
  if (!set.ok) return { ok: false, error: set.error, before };
  const after = await getWebhookInfo();
  return { ok: after.ok, error: after.error, info: after.info, before };
}

let lastHeal = 0;
let healing: Promise<void> | null = null;

/**
 * Self-heal, called when an update arrives without the expected secret header: if (and only if) the
 * webhook registered at Telegram already points at this site, re-register the SAME url with the
 * secret_token. Throttled to one attempt per 10 minutes per isolate. A caller cannot influence the
 * url or the secret, so triggering this is harmless; the unauthenticated request itself is rejected.
 */
export async function healWebhookSecret(): Promise<void> {
  const now = Date.now();
  if (healing) return healing;
  if (now - lastHeal < 10 * 60_000) return;
  lastHeal = now;
  healing = (async () => {
    try {
      const info = await rawWebhookInfo();
      if (!info.ok || !isOurWebhookUrl(info.result.url)) return;
      const r = await setWebhookWithSecret(String(info.result.url), {
        allowedUpdates: Array.isArray(info.result.allowed_updates) ? info.result.allowed_updates : null,
        maxConnections: info.result.max_connections ?? null,
      });
      if (!r.ok) console.error("telegram webhook heal failed:", redactToken(r.error));
    } catch (err) {
      console.error("telegram webhook heal error:", redactToken(err instanceof Error ? err.message : err));
    }
  })().finally(() => {
    healing = null;
  });
  return healing;
}
