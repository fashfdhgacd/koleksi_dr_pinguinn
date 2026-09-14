import { createFileRoute } from "@tanstack/react-router";
import { listCategory, listLatest, listSearch } from "@/lib/catalog/local";

const HOST = "https://www.koleksidrpinguin.com";

function envToken(): string {
  return String(process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

function envAdmin(): string {
  return String(process.env.TELEGRAM_USER_ID || process.env.TELEGRAM_ADMIN_ID || "").trim();
}

async function tgSend(token: string, chatId: string | number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

function parseCount(text: string): number {
  const m = text.match(/\b(5|10|15|20|25|30)\b/);
  return m ? Number(m[1]) : 10;
}

function parseCat(text: string): string {
  const t = text.toLowerCase();
  const cats = [
    "jilbab",
    "tante",
    "amatir",
    "viral",
    "percakapan",
    "kosan",
    "colmek",
    "abg",
    "istri",
    "live",
    "doggy",
    "open-bo",
    "malaysia",
    "chindo",
    "gangbang",
    "lainnya",
    "videy",
  ];
  return cats.find((c) => t.includes(c)) || "";
}

function isShare(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (/https?:\/\//.test(t) && !/^(minta|sebar|share)/.test(t)) return false;
  return /^(minta|sebar|share|lagi|10|25|menu|\/start|\/menu)/.test(t) || Boolean(parseCat(t));
}

async function handleShare(token: string, chatId: string | number, text: string) {
  const n = parseCount(text);
  const cat = parseCat(text);
  const page = cat ? await listCategory(cat, 1, 400) : /cari\s+(.+)/i.test(text)
    ? await listSearch(text.replace(/^.*cari\s+/i, ""), 1, 400)
    : await listLatest(1, 400);
  const items = page.items.slice();
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  const take = items.slice(0, n);
  if (!take.length) {
    await tgSend(token, chatId, cat ? `Kategori ${cat} kosong.` : "Katalog kosong.");
    return;
  }
  const body = take.map((v) => `▶ ${v.title}\n${HOST}/v/${v.id}`).join("\n\n");
  await tgSend(token, chatId, body);
}

async function handlePost(request: Request): Promise<Response> {
  const token = envToken();
  const admin = envAdmin();
  let update: Record<string, unknown> = {};
  try {
    update = (await request.json()) as Record<string, unknown>;
  } catch {
    update = {};
  }
  const msg = (update.message || update.channel_post) as
    | { text?: string; chat?: { id?: number }; from?: { id?: number } }
    | undefined;
  if (!msg?.text || !token) return Response.json({ ok: true });
  const chatId = msg.chat?.id;
  const fromId = String(msg.from?.id || "");
  if (!chatId) return Response.json({ ok: true });
  if (admin && fromId && fromId !== admin && String(chatId) !== admin) {
    await tgSend(token, chatId, "Akses ditolak.");
    return Response.json({ ok: true });
  }
  const text = String(msg.text).trim();
  const low = text.toLowerCase();
  if (low.startsWith("/start") || low === "menu" || low === "/menu") {
    await tgSend(token, chatId, "Bot .com hidup.\nKetik: Minta 10\nAtau: Minta 10 jilbab");
    return Response.json({ ok: true });
  }
  if (isShare(low)) {
    await handleShare(token, chatId, text);
    return Response.json({ ok: true });
  }
  await tgSend(token, chatId, "Ketik Minta 10 atau Minta 10 jilbab.");
  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/telegram")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          service: "telegram-webhook",
          host: HOST,
          ready: Boolean(envToken()),
        }),
      POST: async ({ request }) => handlePost(request),
    },
  },
});
