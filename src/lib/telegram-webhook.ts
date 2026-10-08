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
const KV_LAST_HEAL = "tg:webhook:last-heal:v1";
const KV_LAST_FALLBACK = "tg:webhook:last-ip-fallback:v1";

/**
 * Telegram's official webhook source ranges (core.telegram.org/bots/webhooks): 149.154.160.0/20 and
 * 91.108.4.0/22. CF-Connecting-IP is set by Cloudflare's edge and cannot be forged by the client.
 */
const TELEGRAM_RANGES: Array<[number, number]> = [
  [ipv4ToInt("149.154.160.0"), 20],
  [ipv4ToInt("91.108.4.0"), 22],
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) return -1;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return -1;
    const v = Number(part);
    if (v > 255) return -1;
    n = n * 256 + v;
  }
  return n;
}

/** True when the request comes from Telegram's webhook IP ranges (per CF-Connecting-IP). */
export function isTelegramIp(request: Request): boolean {
  const raw = (request.headers.get("cf-connecting-ip") || "").trim();
  const ip = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  const n = ipv4ToInt(ip);
  if (n < 0) return false;
  return TELEGRAM_RANGES.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    return n >= base && n < base + size;
  });
}

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
  keep?: { allowedUpdates?: string[] | null; maxConnections?: number | null; allowAnyUrl?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  if (!(keep?.allowAnyUrl ? /^https:\/\//i.test(url) : isOurWebhookUrl(url))) {
    return { ok: false, error: "url_not_ours" };
  }
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

type HealRecord = { at: string; ok: boolean; error: string | null; urlOurs: boolean | null; mode: string };

let lastHealAt = 0;
let lastHealOk = false;
let healing: Promise<void> | null = null;
const HEAL_OK_GAP_MS = 10 * 60_000;
const HEAL_FAIL_GAP_MS = 30_000;

function safeCode(text: unknown): string {
  return redactToken(text).replace(/[^A-Za-z0-9 _:.,()'-]/g, " ").slice(0, 120);
}

async function recordHeal(rec: HealRecord): Promise<void> {
  await optionalKvPut(KV_LAST_HEAL, JSON.stringify(rec), 60 * 60 * 24 * 30);
}

/**
 * Self-heal, called when an update arrives without the expected secret header. Re-registers the SAME
 * url that is registered at Telegram, now with the secret_token (pending updates are kept).
 *  - fromTelegram (request came from Telegram's IP ranges): the registered url demonstrably routes to
 *    this Worker, so any https url is accepted.
 *  - otherwise: only when the registered url is one of our hosts + /api/telegram.
 * A caller cannot influence the url or the secret. Throttled per isolate: 10 min after a success,
 * 30 s after a failure (a failed attempt no longer blocks retries for 10 minutes).
 * Every attempt is recorded in KV (time, ok, short error, never the token).
 */
export async function healWebhookSecret(opts: { fromTelegram?: boolean } = {}): Promise<void> {
  const now = Date.now();
  if (healing) return healing;
  const gap = lastHealOk ? HEAL_OK_GAP_MS : HEAL_FAIL_GAP_MS;
  if (lastHealAt && now - lastHealAt < gap) return;
  lastHealAt = now;
  let mode = opts.fromTelegram ? "telegram-ip" : "other";
  healing = (async () => {
    let ok = false;
    let error: string | null = null;
    let urlOurs: boolean | null = null;
    try {
      const info = await rawWebhookInfo();
      if (!info.ok) {
        error = `info: ${safeCode(info.error)}`;
        return;
      }
      const registered = String(info.result.url || "");
      // No webhook registered at all: this Worker is the bot's only update handler, so register our
      // own fixed WEBHOOK_URL (caller cannot influence url or secret). A webhook that points somewhere
      // else is never touched unless the request itself came from Telegram's IP ranges.
      const url = registered || WEBHOOK_URL;
      if (!registered) mode = `${mode}+register`;
      urlOurs = isOurWebhookUrl(url);
      const usable = opts.fromTelegram ? /^https:\/\//i.test(url) : urlOurs;
      if (!usable) {
        error = "url_not_ours";
        return;
      }
      const r = await setWebhookWithSecret(url, {
        allowedUpdates: Array.isArray(info.result.allowed_updates) ? info.result.allowed_updates : null,
        maxConnections: info.result.max_connections ?? null,
        allowAnyUrl: Boolean(opts.fromTelegram),
      });
      ok = r.ok;
      if (!r.ok) error = `set: ${safeCode(r.error)}`;
    } catch (err) {
      error = `exception: ${safeCode(err instanceof Error ? err.message : err)}`;
    } finally {
      lastHealOk = ok;
      if (!ok) console.error("telegram webhook heal failed:", error);
      await recordHeal({ at: new Date().toISOString(), ok, error, urlOurs, mode }).catch(() => undefined);
    }
  })().finally(() => {
    healing = null;
  });
  return healing;
}

let lastFallbackWrite = 0;
/** Record (throttled) that an un-secreted update from Telegram's IP range was accepted. */
export async function markIpFallbackUpdate(): Promise<void> {
  const now = Date.now();
  if (now - lastFallbackWrite < 5 * 60_000) return;
  lastFallbackWrite = now;
  await optionalKvPut(KV_LAST_FALLBACK, new Date(now).toISOString(), 60 * 60 * 24 * 30);
}

function recent(iso: string | null, ms: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t < ms;
}

/**
 * Public, owner-free health signal: booleans and a short error code only (no url, no ids, no times,
 * no token/secret).
 */
export async function webhookHealth(): Promise<Record<string, unknown>> {
  const [setupAt, okAt, fallbackAt, healRaw] = await Promise.all([
    lastSetupAt(),
    lastVerifiedUpdateAt(),
    optionalKvGet(KV_LAST_FALLBACK),
    optionalKvGet(KV_LAST_HEAL),
  ]);
  let heal: HealRecord | null = null;
  try {
    heal = healRaw ? (JSON.parse(healRaw) as HealRecord) : null;
  } catch {
    heal = null;
  }
  return {
    ok: true,
    secretInstalled: Boolean(setupAt),
    secretInstalledLastHour: recent(setupAt, 3600_000),
    signedUpdateLastHour: recent(okAt, 3600_000),
    ipFallbackUpdateLastHour: recent(fallbackAt, 3600_000),
    lastHealOk: heal ? Boolean(heal.ok) : null,
    lastHealLastHour: heal ? recent(heal.at, 3600_000) : false,
    lastHealError: heal?.error ? safeCode(heal.error) : null,
    lastHealUrlOurs: heal ? heal.urlOurs : null,
    lastHealMode: heal?.mode || null,
  };
}
