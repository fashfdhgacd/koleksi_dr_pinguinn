import { createFileRoute } from "@tanstack/react-router";
import { listCategory, listLatest, listSearch } from "@/lib/catalog/local";
import { parseMessage, detectCategory, cleanTitle } from "@/lib/bot/parse.js";
import { toRecord, upsertInMemory } from "@/lib/bot/store.js";
import { fetchPutarinTitle, fetchStreamtapeTitle } from "@/lib/bot/providers.js";
import { fetchJsonFromGithub, pushJsonToGithub } from "@/lib/bot/github.js";

const HOST = "https://www.koleksidrpinguin.com";

function envToken(): string {
  return String(
    process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || ""
  ).trim();
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
      .filter(Boolean)
  );
}

function envBag(): NodeJS.ProcessEnv {
  return process.env;
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
  return (
    /^(minta|sebar|share|lagi|10|25|menu|\/start|\/menu)/.test(t) ||
    Boolean(parseCat(t))
  );
}

async function handleShare(
  token: string,
  chatId: string | number,
  text: string
) {
  const n = parseCount(text);
  const cat = parseCat(text);
  const page = cat
    ? await listCategory(cat, 1, 400)
    : /cari\s+(.+)/i.test(text)
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
    await tgSend(
      token,
      chatId,
      cat ? `Kategori ${cat} kosong.` : "Katalog kosong."
    );
    return;
  }
  const body = take
    .map((v) => `▶ ${v.title}\n${HOST}/v/${v.id}`)
    .join("\n\n");
  await tgSend(token, chatId, body);
}

async function resolveTitle(
  parsed: { host: string; id: string },
  givenTitle: string
): Promise<string> {
  if (givenTitle && givenTitle !== "Video") return givenTitle;
  const env = envBag();
  if (parsed.host === "putarin") {
    const t = await fetchPutarinTitle(parsed.id, env);
    if (t) return cleanTitle(t);
  }
  if (parsed.host === "streamtape") {
    const t = await fetchStreamtapeTitle(parsed.id, env);
    if (t) return cleanTitle(t);
  }
  return givenTitle || "Video";
}

async function handleUpload(
  token: string,
  chatId: string | number,
  text: string
) {
  const parsedMsg = parseMessage(text);
  if (!parsedMsg.videos.length) {
    await tgSend(
      token,
      chatId,
      "❌ Tidak ada link Streamtape / Putarin yang valid.\n\nKirim link, atau ketik: Minta 10"
    );
    return;
  }

  const env = envBag();
  const lines: string[] = [];

  for (const video of parsedMsg.videos) {
    const title = await resolveTitle(video, parsedMsg.title);
    const category = parsedMsg.category || detectCategory(title);
    const record = toRecord({ parsed: video, title, category });
    const fileName = video.file;

    // Read current JSON from GitHub (serverless-safe)
    const fetched = await fetchJsonFromGithub(env, fileName);
    if (!fetched.ok && fetched.reason) {
      lines.push(`⚠️ Gagal baca GitHub (${fileName}): ${fetched.reason}`);
      continue;
    }

    const result = upsertInMemory(fetched.items, record);
    const json = JSON.stringify(result.items, null, 2) + "\n";

    try {
      await pushJsonToGithub(env, fileName, json, fetched.sha);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`⚠️ Gagal push GitHub (${fileName}): ${msg}`);
      continue;
    }

    const mark = result.action === "created" ? "✅" : "♻️";
    lines.push(
      [
        `${mark} ${result.action.toUpperCase()}`,
        `Judul: ${record.title}`,
        `ID: ${record.id}`,
        `Source: ${record.source}`,
        `Kategori: ${record.category}`,
        `File: data/${fileName}`,
        `Total: ${result.total}`,
      ].join("\n")
    );
  }

  await tgSend(token, chatId, lines.join("\n\n") || "Tidak ada yang diproses.");
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
    | {
        text?: string;
        caption?: string;
        chat?: { id?: number };
        from?: { id?: number };
      }
    | undefined;

  if (!msg || !token) return Response.json({ ok: true });

  const chatId = msg.chat?.id;
  const fromId = String(msg.from?.id || "");
  if (!chatId) return Response.json({ ok: true });

  // Auth: if AUTHORIZED_USER_IDS / TELEGRAM_USER_ID set, enforce it
  if (allowed.size > 0 && !allowed.has(fromId) && !allowed.has(String(chatId))) {
    await tgSend(token, chatId, "❌ Tidak diizinkan.");
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
        "Bot aktif (webhook).",
        "",
        "📤 Upload:",
        "Kirim link Streamtape / Putarin",
        "Boleh + Judul: ... + Kategori: ...",
        "",
        "📥 Minta video:",
        "Minta 10",
        "Minta 10 jilbab",
      ].join("\n")
    );
    return Response.json({ ok: true });
  }

  // Prefer upload when there is a valid host link
  const hasUploadLink =
    /streamtape\.com|putarin\.com|strcloud/i.test(text) &&
    /https?:\/\//i.test(text);

  if (hasUploadLink) {
    await handleUpload(token, chatId, text);
    return Response.json({ ok: true });
  }

  if (isShare(low)) {
    await handleShare(token, chatId, text);
    return Response.json({ ok: true });
  }

  await tgSend(
    token,
    chatId,
    "Kirim link Streamtape/Putarin untuk upload, atau ketik: Minta 10"
  );
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
          modes: ["upload", "share"],
          ready: Boolean(envToken()),
        }),
      POST: async ({ request }) => handlePost(request),
    },
  },
});
