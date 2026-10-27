import { createFileRoute } from "@tanstack/react-router";
import { collectSharePool } from "@/lib/bot/share-pool";
import { loadShareUsed, saveShareUsed } from "@/lib/bot/share-used";
import { processUploadBatch } from "@/lib/bot/upload-handler.js";
import { parseMessage } from "@/lib/bot/parse.js";
import { handleMyChatMember } from "@/lib/bot/channel-post";
import { isOwnerRequest } from "@/lib/owner-auth";
import {
  TELEGRAM_SECRET_HEADER,
  healWebhookSecret,
  isTelegramIp,
  markIpFallbackUpdate,
  webhookHealth,
  markVerifiedUpdate,
  redactToken,
  timingSafeSecretMatch,
  webhookSecret,
} from "@/lib/telegram-webhook";

export const maxDuration = 60;

const HOST = "https://koleksidrpinguin.com";
const COUNTS = [5, 10, 15, 20, 25, 30, 50, 100];

const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "Minta 10" }, { text: "Minta 25" }, { text: "Minta 100" }],
    [{ text: "Terbaru" }, { text: "Semua" }, { text: "Amatir" }, { text: "Videy" }],
    [{ text: "Jav" }, { text: "AI+" }, { text: "Lulu" }],
    [{ text: "Jilbab" }, { text: "Teen 18+" }, { text: "Streamtape" }],
    [{ text: "Lagi" }, { text: "Menu" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

function envToken(): string {
  return String(process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

function envAdminIds(): Set<string> {
  const raw =
    process.env.AUTHORIZED_USER_IDS ||
    process.env.TELEGRAM_USER_ID ||
    process.env.TELEGRAM_ADMIN_ID ||
    "";
  return new Set(
    String(raw)
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function envBag(): NodeJS.ProcessEnv {
  return process.env;
}

async function deferWork(promise: Promise<unknown>): Promise<boolean> {
  try {
    const g = globalThis as { waitUntil?: (p: Promise<unknown>) => void };
    if (typeof g.waitUntil === "function") {
      g.waitUntil(promise);
      return true;
    }
  } catch {
    /* ignore */
  }
  // Cloudflare Workers: waitUntil from the runtime module, so the webhook answers Telegram at once
  // and a big batch keeps running after the 200 (otherwise Telegram times out and marks an error).
  try {
    const cf = (await import("cloudflare:workers")) as { waitUntil?: (p: Promise<unknown>) => void };
    if (typeof cf.waitUntil === "function") {
      cf.waitUntil(promise);
      return true;
    }
  } catch {
    /* not on Workers */
  }
  try {
    const mod = await import("@vercel/functions");
    if (typeof (mod as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil === "function") {
      (mod as { waitUntil: (p: Promise<unknown>) => void }).waitUntil(promise);
      return true;
    }
  } catch {
    /* optional */
  }
  return false;
}

async function tgSend(
  token: string,
  chatId: string | number,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, ...extra }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("tgSend failed", res.status, redactToken(body.slice(0, 200), token));
      return false;
    }
    return true;
  } catch (err) {
    console.error("tgSend error", redactToken(err instanceof Error ? err.message : err, token));
    return false;
  }
}

async function tgSendChunks(
  token: string,
  chatId: string | number,
  text: string,
  extra: Record<string, unknown> = {},
) {
  const limit = 3500;
  const raw = String(text || "").trim();
  if (!raw) return;
  if (raw.length <= limit) {
    await tgSend(token, chatId, raw, extra);
    return;
  }
  const parts: string[] = [];
  let buf = "";
  for (const block of raw.split("\n\n")) {
    const next = buf ? `${buf}\n\n${block}` : block;
    if (next.length > limit && buf) {
      parts.push(buf);
      buf = block;
    } else {
      buf = next;
    }
  }
  if (buf) parts.push(buf);
  for (let i = 0; i < parts.length; i++) {
    const chunk = parts.length > 1 ? `(${i + 1}/${parts.length})\n${parts[i]}` : parts[i];
    await tgSend(token, chatId, chunk, i === parts.length - 1 ? extra : {});
  }
}

function parseCount(text: string): number {
  const m = text.match(/\b(100|50|30|25|20|15|10|5)\b/);
  return m ? Number(m[1]) : 10;
}

function hasCount(text: string): boolean {
  return COUNTS.some((n) => new RegExp(`\\b${n}\\b`).test(text));
}

function parseCat(text: string): string {
  const t = text.toLowerCase().trim();
  const map: Record<string, string> = {
    terbaru: "terbaru",
    jilbab: "jilbab",
    amatir: "amatir",
    abg: "teen-18",
    teen: "teen-18",
    "teen 18+": "teen-18",
    "teen (18+)": "teen-18",
    "teen-18": "teen-18",
    mahasiswi: "college-18",
    college: "college-18",
    "college 18+": "college-18",
    "college (18+)": "college-18",
    "college-18": "college-18",
    "ai gay": "ai-gay",
    "ai-gay": "ai-gay",
    aigay: "ai-gay",
    "blunder": "blunder",
    "kelas-bintang": "kelas-bintang",
    "kelas bintang": "kelas-bintang",
    "kelasbintang": "kelas-bintang",
    "tiktok": "tiktok",
    "mantan": "mantan",
    "vcs": "vcs",
    "kompilasi": "kompilasi",
    "tetangga": "tetangga",
    "kacamata": "kacamata",
    "kantor": "kantor",
    "anal": "anal",
    "cantik": "cantik",
    ai: "ai-plus",
    "ai+": "ai-plus",
    jav: "jav",
    puterin: "jav",
    putarin: "jav",
    videy: "videy",
    tante: "tante",
    viral: "viral",
    percakapan: "percakapan",
    kosan: "kosan",
    colmek: "colmek",
    istri: "istri",
    live: "live",
    doggy: "doggy",
    "open-bo": "open-bo",
    malaysia: "malaysia",
    chindo: "chindo",
    gangbang: "gangbang",
    lainnya: "lainnya",
  };
  if (map[t]) return map[t];
  for (const [k, v] of Object.entries(map)) {
    if (t.includes(k)) return v;
  }
  return "";
}

function parseSource(text: string): string {
  const t = text.toLowerCase().trim();
  // Lulu first: "lulustream" also contains "stream" and used to fall into Streamtape.
  if (/lulu|lulustream/.test(t)) return "lulu";
  if (/streamtape|strcloud|sterampie|stream/.test(t)) return "streamtape";
  if (/putarin/.test(t)) return "putarin";
  return "";
}

function isMenuText(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    t === "menu" ||
    t === "/menu" ||
    t === "/start" ||
    t === "lagi" ||
    t === "semua" ||
    Boolean(parseCat(t)) ||
    Boolean(parseSource(t)) ||
    /^(minta|sebar|share)\b/.test(t) ||
    /^\d+$/.test(t)
  );
}

async function handleShare(token: string, chatId: string | number, text: string) {
  const usedFile = await loadShareUsed();
  const raw = text.trim();
  const isLagi = /^lagi$/i.test(raw);
  const n = hasCount(raw) ? parseCount(raw) : usedFile.lastCount || parseCount(raw);
  const cat = parseCat(raw) || (isLagi ? usedFile.lastCat || "" : "");
  const source = parseSource(raw) || (isLagi ? usedFile.lastSource || "" : "");

  const picked = await collectSharePool({
    count: n,
    category: cat,
    source,
    excludeIds: usedFile.used,
    excludeTitles: usedFile.titles,
  });

  if (!picked.items.length) {
    const label = cat || source || "katalog";
    await tgSend(token, chatId, `Kosong: ${label}. Coba kategori lain.`, {
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  const take = picked.items;
  const nextUsed = usedFile.used.concat(take.map((v) => String(v.id)));
  const nextTitles = (usedFile.titles || []).concat(take.map((v) => String(v.title || "")));
  await saveShareUsed({
    resetAt: picked.reset ? Date.now() : usedFile.resetAt,
    used: picked.reset ? take.map((v) => String(v.id)) : nextUsed,
    titles: picked.reset ? take.map((v) => String(v.title || "")) : nextTitles,
    lastCat: cat,
    lastSource: source,
    lastCount: n,
  }).catch((err) => console.error("saveShareUsed", err));

  const body =
    `${take.length} link · tidak diulang hari ini\n\n` +
    take.map((v) => `\u25b6 ${v.title}\n${HOST}/watch/${v.id}`).join("\n\n");
  await tgSendChunks(token, chatId, body, { reply_markup: MAIN_KEYBOARD });
}

/** Empty 200: Telegram treats the update as delivered; nothing is revealed to the sender. */
function ack(): Response {
  return Response.json({ ok: true });
}

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

async function handlePost(request: Request): Promise<Response> {
  const token = envToken();
  if (!token) return notFound();

  // 1) Only Telegram knows the secret_token (derived from BOT_TOKEN, set via setWebhook).
  const expected = await webhookSecret(token);
  const given = request.headers.get(TELEGRAM_SECRET_HEADER) || "";
  const signed = Boolean(expected && given && (await timingSafeSecretMatch(given, expected)));
  let viaIpFallback = false;
  if (!signed) {
    // Not signed (secret not registered yet, or rotated). Re-register the webhook with the secret
    // (throttled, same url, pending updates kept) so the next deliveries carry the header.
    const fromTelegram = isTelegramIp(request);
    await healWebhookSecret({ fromTelegram }).catch(() => undefined);
    // Fallback: still serve the update when it demonstrably comes from Telegram's official webhook
    // IP ranges (CF-Connecting-IP cannot be forged through Cloudflare). Everyone else: 401.
    if (!fromTelegram) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
    viaIpFallback = true;
  }

  // 2) Deny-all unless an allowlist is configured; only the sender (from.id) counts.
  const allowed = envAdminIds();
  let update: Record<string, unknown> = {};
  try {
    update = (await request.json()) as Record<string, unknown>;
  } catch {
    return ack();
  }

  // Bot promoted to admin in a channel by a trusted admin: remember it for auto-posting.
  if (update.my_chat_member) {
    if (viaIpFallback) await markIpFallbackUpdate().catch(() => undefined);
    const work = handleMyChatMember(
      token,
      update.my_chat_member as Parameters<typeof handleMyChatMember>[1],
      allowed,
      (id, t) => tgSend(token, id, t),
    ).catch(() => false);
    if (!(await deferWork(work))) await work;
    return ack();
  }

  const msg = update.message as
    | { text?: string; caption?: string; chat?: { id?: number }; from?: { id?: number; is_bot?: boolean } }
    | undefined;
  if (!msg) return ack();

  const chatId = msg.chat?.id;
  const fromId = msg.from?.id != null ? String(msg.from.id) : "";
  if (!chatId || !fromId || msg.from?.is_bot) return ack();
  // Unknown senders/chats are ignored silently (no reply, so the bot cannot be used to spam).
  if (allowed.size === 0 || !allowed.has(fromId)) return ack();

  if (viaIpFallback) await markIpFallbackUpdate().catch(() => undefined);
  else await markVerifiedUpdate().catch(() => undefined);

  const text = String(msg.text || msg.caption || "").trim();
  if (!text) return Response.json({ ok: true });

  const low = text.toLowerCase();

  if (low.startsWith("/start") || low === "menu" || low === "/menu") {
    await tgSend(
      token,
      chatId,
      [
        "Bot aktif.",
        "",
        "\ud83d\udce4 Upload: IndoAV / UserBokep / Puterin / Streamtape / Videy",
        "\ud83d\udc27 Koleksi Dr. Pinguin Bokep: link LuluStream / DoodStream / Byse",
        "\ud83d\udce5 Minta: 10, 25, atau 100",
      ].join("\n"),
      { reply_markup: MAIN_KEYBOARD },
    );
    return Response.json({ ok: true });
  }

  // Known hosts by name, plus anything the bot parser accepts (LuluStream / DoodStream mirrors /
  // Byse on its own embed domains: src/lib/catalog/drp-hosts.js).
  // Bare Videy ids (no https) count too: parseMessage turns them into Videy links.
  const hasUploadLink =
    (/https?:\/\//i.test(text) &&
    (/streamtape\.com|strcloud|putarin\.com|puterin\.|panel\.putarin|luluvdo|lulustream|luluvid|lulu\.st|indoav\.|userbokep|videy\.co/i.test(
      text,
    ) ||
      parseMessage(text).videos.length > 0)) ||
    parseMessage(text).videos.length > 0;

  if (hasUploadLink) {
    const work = processUploadBatch({
      token,
      chatId,
      text,
      env: envBag(),
      tgSend,
      tgSendChunks,
      MAIN_KEYBOARD,
    })
      // The channel post now runs inside processUploadBatch (before the final ACK, which reports it).
      .catch((err) => console.error("handleUpload", redactToken(err instanceof Error ? err.message : err, token)));
    if (!(await deferWork(work))) {
      await work;
    }
    return Response.json({ ok: true });
  }

  if (isMenuText(low)) {
    await handleShare(token, chatId, text);
    return Response.json({ ok: true });
  }

  await tgSend(token, chatId, "Kirim link untuk upload, atau tekan tombol menu.", {
    reply_markup: MAIN_KEYBOARD,
  });
  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/telegram")({
  server: {
    handlers: {
      // Owner-only minimal status (no GitHub call, no repo/config details). Everyone else: 404.
      GET: async ({ request }) => {
        // Public health signal: booleans + short error code only (no url, ids, times or secrets).
        if (new URL(request.url).searchParams.get("health") === "1") {
          return Response.json(await webhookHealth(), { headers: { "cache-control": "no-store" } });
        }
        if (!(await isOwnerRequest(request))) return notFound();
        const env = process.env;
        const has = (k: string) => Boolean(String(env[k] || "").trim());
        return Response.json(
          {
            ok: true,
            service: "telegram-webhook",
            ready: Boolean(envToken()),
            adminConfigured: envAdminIds().size > 0,
            ghTokenConfigured: has("GH_TOKEN") || has("GITHUB_TOKEN"),
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
      POST: async ({ request }) => handlePost(request),
    },
  },
});
