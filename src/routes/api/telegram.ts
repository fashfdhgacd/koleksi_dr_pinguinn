import { createFileRoute } from "@tanstack/react-router";
import { collectSharePool } from "@/lib/bot/share-pool";
import { loadShareUsed, saveShareUsed } from "@/lib/bot/share-used";
import { processUploadBatch } from "@/lib/bot/upload-handler.js";

export const maxDuration = 60;

const HOST_SITE = "https://www.koleksidrpinguin.site";
const HOST_COM = "https://koleksidrpinguin.com";

function pickHost(): string {
  return Math.random() < 0.5 ? HOST_SITE : HOST_COM;
}

const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "Minta 10" }, { text: "Minta 25" }],
    [{ text: "Semua" }, { text: "Amatir" }, { text: "Videy" }],
    [{ text: "Jav" }, { text: "AI+" }, { text: "Lulu" }],
    [{ text: "Jilbab" }, { text: "ABG" }, { text: "Streamtape" }],
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
      console.error("tgSend failed", res.status, body.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error("tgSend error", err);
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
  const m = text.match(/\b(5|10|15|20|25|30)\b/);
  return m ? Number(m[1]) : 10;
}

function parseCat(text: string): string {
  const t = text.toLowerCase().trim();
  const map: Record<string, string> = {
    jilbab: "jilbab",
    amatir: "amatir",
    abg: "abg",
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
  if (/streamtape|strcloud|sterampie|stream/.test(t)) return "streamtape";
  if (/putarin/.test(t)) return "putarin";
  if (/lulu|lulustream/.test(t)) return "lulu";
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
  const n = /\b(5|10|15|20|25|30)\b/.test(raw)
    ? parseCount(raw)
    : usedFile.lastCount || parseCount(raw);
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

  const note = picked.reset
    ? `\n\n(Pool ${picked.poolSize} habis dipakai — acak ulang dari awal)`
    : `\n\nSisa belum dipakai: ${Math.max(0, picked.freshSize - take.length)} / ${picked.poolSize}`;
  const body =
    take.map((v) => `\u25b6 ${v.title}\n${pickHost()}/watch/${v.id}`).join("\n\n") + note;
  await tgSendChunks(token, chatId, body, { reply_markup: MAIN_KEYBOARD });
}

async function handlePost(request: Request): Promise<Response> {
  const token = envToken();
  const allowed = envAdminIds();
  let update: Record<string, unknown> = {};
  try {
    update = (await request.json()) as Record<string, unknown>;
  } catch {
    update = {};
  }

  const msg = (update.message || update.channel_post) as
    | { text?: string; caption?: string; chat?: { id?: number }; from?: { id?: number } }
    | undefined;

  if (!msg || !token) return Response.json({ ok: true });

  const chatId = msg.chat?.id;
  const fromId = String(msg.from?.id || "");
  if (!chatId) return Response.json({ ok: true });

  if (allowed.size > 0 && !allowed.has(fromId) && !allowed.has(String(chatId))) {
    await tgSend(token, chatId, "\u274c Tidak diizinkan.");
    return Response.json({ ok: true });
  }

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
        "\ud83d\udce4 Upload: IndoAV / UserBokep / Puterin / Streamtape / Lulu / Videy",
        "\ud83d\udce5 Minta: tekan tombol di bawah",
      ].join("\n"),
      { reply_markup: MAIN_KEYBOARD },
    );
    return Response.json({ ok: true });
  }

  const hasUploadLink =
    /https?:\/\//i.test(text) &&
    /streamtape\.com|strcloud|putarin\.com|puterin\.|panel\.putarin|luluvdo|lulustream|luluvid|lulu\.st|indoav\.|userbokep|videy\.co/i.test(
      text,
    );

  if (hasUploadLink) {
    const work = processUploadBatch({
      token,
      chatId,
      text,
      env: envBag(),
      tgSend,
      tgSendChunks,
      MAIN_KEYBOARD,
    }).catch((err) => console.error("handleUpload", err));
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
      GET: async () => {
        const env = process.env;
        const has = (k: string) => Boolean(String(env[k] || "").trim());
        const token = String(env.GH_TOKEN || env.GITHUB_TOKEN || "").trim();
        const ghOwner = String(env.GH_OWNER || env.GITHUB_OWNER || "").trim() || "fashfdhgacd";
        let ghRepo = String(env.GH_REPO || env.GITHUB_REPO || "").trim() || "koleksi_dr_pinguinn";
        if (ghRepo === "koleksi_dr_pinguin" || ghRepo === "koleksi-dr-pinguin") ghRepo = "koleksi_dr_pinguinn";
        let ghAccess: string = "unknown";
        let ghPrivate: boolean | null = null;
        if (token && ghOwner && ghRepo) {
          try {
            const r = await fetch(`https://api.github.com/repos/${ghOwner}/${ghRepo}`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "kdp-bot-diag",
              },
            });
            if (r.status === 200) {
              const body = (await r.json()) as { private?: boolean; permissions?: { push?: boolean } };
              ghPrivate = Boolean(body.private);
              ghAccess = body.permissions?.push ? "push_ok" : "read_only";
            } else if (r.status === 401) {
              ghAccess = "bad_token";
            } else if (r.status === 404) {
              ghAccess = "repo_not_found_or_no_access";
            } else {
              ghAccess = `http_${r.status}`;
            }
          } catch {
            ghAccess = "network_error";
          }
        } else {
          ghAccess = "missing_env";
        }
        return Response.json({
          ok: true,
          service: "telegram-webhook",
          host: pickHost(),
          hosts: { site: HOST_SITE, com: HOST_COM },
          modes: ["upload", "share", "keyboard"],
          ready: Boolean(envToken()),
          upload: {
            botToken: has("BOT_TOKEN") || has("TELEGRAM_BOT_TOKEN"),
            adminId: has("AUTHORIZED_USER_IDS") || has("TELEGRAM_USER_ID") || has("TELEGRAM_ADMIN_ID"),
            ghToken: Boolean(token),
            ghOwner: ghOwner || null,
            ghRepo: ghRepo || null,
            ghAccess,
            ghPrivate,
            streamtape: has("STREAMTAPE_LOGIN") && has("STREAMTAPE_KEY"),
            putarin: has("PUTARIN_API_KEY"),
            canWriteJson: ghAccess === "push_ok",
          },
        });
      },
      POST: async ({ request }) => handlePost(request),
    },
  },
});
