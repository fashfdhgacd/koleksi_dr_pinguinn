/**
 * Web push sendiri (tanpa layanan pihak ketiga), murni Web Crypto:
 *  - VAPID JWT ES256 (RFC 8292), kunci privat dari secret VAPID_PRIVATE_KEY (base64url scalar d)
 *  - payload terenkripsi aes128gcm (RFC 8291)
 * Penyimpanan di D1 (ANALYTICS_DB): push_subs (satu baris per langganan, ditulis sekali saat
 * pengunjung tap "Aktifkan notifikasi") dan push_log (satu baris per kiriman, maks 2 per hari WIB).
 * Dipanggil sekali per batch upload dari bot (upload-handler.js). Tidak ada timer/polling.
 */
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";

export const VAPID_PUBLIC_KEY =
  "BBXqnGgBHfzCURAS5J60ltkSpMHD__nBM3-Jex_euH4hMs8M80yt7qnGQDuqc3SV7Ro9938YWYX1pyADypU7dpc";
const VAPID_SUBJECT = "https://koleksidrpinguin.com";
export const MAX_PUSH_PER_DAY = 2;
const MAX_SUBS_PER_SEND = 900;

const SCHEMA = [
  `create table if not exists push_subs (
     endpoint text primary key,
     p256dh text not null,
     auth text not null,
     created_at integer not null
   )`,
  `create table if not exists push_log (
     day text not null,
     sent_at integer not null,
     subs integer not null default 0,
     ok integer not null default 0
   )`,
  `create index if not exists push_log_day on push_log (day)`,
];

const g = globalThis as typeof globalThis & { __pushSchema__?: Promise<void> };

export async function pushDb(): Promise<D1DatabaseLike | null> {
  const db = await getD1().catch(() => null);
  if (!db) return null;
  g.__pushSchema__ ??= db
    .batch(SCHEMA.map((s) => db.prepare(s)))
    .then(() => undefined)
    .catch((err) => {
      g.__pushSchema__ = undefined;
      throw err;
    });
  await g.__pushSchema__;
  return db;
}

// ---------- base64url ----------
const enc = new TextEncoder();
export function b64uToBytes(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
export function bytesToB64u(bytes: Uint8Array | ArrayBuffer): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---------- VAPID ----------
async function readSecret(): Promise<string> {
  let v = "";
  try {
    v = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  } catch {
    /* ignore */
  }
  if (v) return v;
  try {
    const mod = (await import("cloudflare:workers")) as { env?: Record<string, unknown> };
    v = String(mod.env?.VAPID_PRIVATE_KEY || "").trim();
  } catch {
    /* ignore */
  }
  if (v) return v;
  const ge = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  return String(ge?.VAPID_PRIVATE_KEY || "").trim();
}

let vapidKeyCache: CryptoKey | null = null;
async function vapidSigningKey(): Promise<CryptoKey> {
  if (vapidKeyCache) return vapidKeyCache;
  const d = await readSecret();
  if (!d) throw new Error("VAPID_PRIVATE_KEY belum di-set");
  const pub = b64uToBytes(VAPID_PUBLIC_KEY);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d,
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
    ext: false,
  };
  vapidKeyCache = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return vapidKeyCache;
}

async function vapidAuthHeader(endpoint: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64u(
    enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT })),
  );
  const unsigned = `${header}.${claims}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await vapidSigningKey(), enc.encode(unsigned));
  return `vapid t=${unsigned}.${bytesToB64u(sig)}, k=${VAPID_PUBLIC_KEY}`;
}

// ---------- aes128gcm (RFC 8291) ----------
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8);
  return new Uint8Array(bits);
}

export async function encryptPayload(p256dh: string, authSecret: string, plaintext: string): Promise<Uint8Array> {
  const uaPub = b64uToBytes(p256dh);
  const auth = b64uToBytes(authSecret);
  const eph = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPub = new Uint8Array((await crypto.subtle.exportKey("raw", eph.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as EcdhKeyDeriveParams, eph.privateKey, 256),
  );
  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const padded = concat(enc.encode(plaintext), new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

export type PushSub = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url: string; icon?: string };

/** Kirim satu notifikasi. Return status HTTP dari push service (201 = ok, 404/410 = langganan mati). */
export async function sendOne(sub: PushSub, msg: PushMessage): Promise<number> {
  const body = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(msg));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthHeader(sub.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
  });
  return res.status;
}

const ALLOWED_PUSH_HOSTS =
  /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com)$/i;

export function validSubscription(raw: unknown): PushSub | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = String(o.endpoint || "").trim();
  const p256dh = String(o.keys?.p256dh || "").trim();
  const auth = String(o.keys?.auth || "").trim();
  if (endpoint.length > 1000 || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return null;
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || !ALLOWED_PUSH_HOSTS.test(u.hostname)) return null;
  } catch {
    return null;
  }
  return { endpoint, p256dh, auth };
}

function wibDay(now = Date.now()): string {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export type PushReport = { sent: number; total: number; removed: number; skipped?: string; error?: string };

/**
 * Sekali per batch upload: kirim "video baru" ke semua pelanggan, maks MAX_PUSH_PER_DAY per hari (WIB).
 * Tidak pernah melempar error ke pemanggil.
 */
export async function pushNewVideos(videos: { id: string; title: string; hidden?: boolean }[]): Promise<PushReport> {
  const visible = videos.filter((v) => v && v.id && !v.hidden);
  if (!visible.length) return { sent: 0, total: 0, removed: 0, skipped: "tidak ada video publik" };
  try {
    if (!(await readSecret())) return { sent: 0, total: 0, removed: 0, skipped: "VAPID_PRIVATE_KEY belum di-set" };
    const db = await pushDb();
    if (!db) return { sent: 0, total: 0, removed: 0, error: "D1 tidak tersedia" };
    const day = wibDay();
    const row = (await db.prepare("select count(*) as n from push_log where day = ?").bind(day).first()) as { n?: number } | null;
    if (Number(row?.n || 0) >= MAX_PUSH_PER_DAY) {
      return { sent: 0, total: 0, removed: 0, skipped: `batas ${MAX_PUSH_PER_DAY}x/hari tercapai` };
    }
    const subs = ((await db
      .prepare("select endpoint, p256dh, auth from push_subs order by created_at desc limit ?")
      .bind(MAX_SUBS_PER_SEND)
      .all()) as { results?: PushSub[] }).results || [];
    if (!subs.length) return { sent: 0, total: 0, removed: 0, skipped: "belum ada pelanggan" };
    // Catat dulu supaya batch paralel tidak lolos batas harian.
    await db.prepare("insert into push_log (day, sent_at, subs, ok) values (?, ?, ?, 0)").bind(day, Date.now(), subs.length).run();
    const first = visible[0];
    const msg: PushMessage = {
      title: visible.length > 1 ? `${visible.length} video baru di Koleksi Dr. Pinguin` : "Video baru di Koleksi Dr. Pinguin",
      body: String(first.title || "Video baru").slice(0, 120),
      url: visible.length > 1 ? "/" : `/watch/${encodeURIComponent(first.id)}`,
      icon: "/logo-penguin.png",
    };
    let sent = 0;
    const dead: string[] = [];
    const CONC = 20;
    for (let i = 0; i < subs.length; i += CONC) {
      await Promise.all(
        subs.slice(i, i + CONC).map(async (s) => {
          try {
            const st = await sendOne(s, msg);
            if (st >= 200 && st < 300) sent++;
            else if (st === 404 || st === 410) dead.push(s.endpoint);
          } catch {
            /* satu langganan gagal tidak menghentikan batch */
          }
        }),
      );
    }
    if (dead.length) {
      await db.batch(dead.map((e) => db.prepare("delete from push_subs where endpoint = ?").bind(e))).catch(() => undefined);
    }
    return { sent, total: subs.length, removed: dead.length };
  } catch (err) {
    return { sent: 0, total: 0, removed: 0, error: (err instanceof Error ? err.message : String(err)).slice(0, 160) };
  }
}

export function pushReportLine(r: PushReport): string {
  if (r.error) return `🔔 Push gagal: ${r.error}`;
  if (r.skipped) return `🔔 Push dilewati: ${r.skipped}`;
  return `🔔 Push: ${r.sent}/${r.total} terkirim${r.removed ? ` · ${r.removed} langganan mati dihapus` : ""}`;
}
