import { createFileRoute } from "@tanstack/react-router";
import { listCategory, listLatest, listSearch } from "@/lib/catalog/local";
import { parseMessage, detectCategory, cleanTitle } from "@/lib/bot/parse.js";
import { toRecord } from "@/lib/bot/store.js";
import { fetchPutarinTitle, fetchStreamtapeTitle } from "@/lib/bot/providers.js";
import { upsertVideoToGithub } from "@/lib/bot/github.js";

const HOST = "https://www.koleksidrpinguin.com";

/** Reply keyboard mirip bot lama + Streamtape */
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "Minta 10" }, { text: "Minta 25" }],
    [{ text: "Semua" }, { text: "Amatir" }, { text: "Videy" }],
    [{ text: "Streamtape" }, { text: "Putarin" }, { text: "Lulu" }],
    [{ text: "Jilbab" }, { text: "ABG" }, { text: "AI" }],
    [{ text: "Lagi" }, { text: "Menu" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

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

async function tgSend(
  token: string,
  chatId: string | number,
  text: string,
  extra: Record<string, unknown> = {}
) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  });
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
    ai: "ai",
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

async function handleShare(
  token: string,
  chatId: string | number,
  text: string
) {
  const n = parseCount(text);
  const cat = parseCat(text);
  const source = parseSource(text);
  const wantAll = /^(semua|lagi|menu)$/i.test(text.trim());

  let page;
  if (cat) {
    page = await listCategory(cat, 1, 400);
  } else if (/cari\s+(.+)/i.test(text)) {
    page = await listSearch(text.replace(/^.*cari\s+/i, ""), 1, 400);
  } else if (source) {
    page = await listLatest(1, 800);
  } else {
    page = await listLatest(1, 400);
  }

  let items = page.items.slice();

  if (source) {
    items = items.filter((v) => {
      const blob = [
        (v as { creator?: string | null }).creator,
        (v as { quality?: string }).quality,
        (v as { description?: string }).description,
        (v as { title?: string }).title,
        (v as { id?: string }).id,
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      if (source === "streamtape")
        return /streamtape|strcloud|\bstream\b/.test(blob);
      if (source === "putarin") return /putarin/.test(blob);
      if (source === "lulu") return /lulu/.test(blob);
      return true;
    });
  }

  if (source && !items.length) {
    const q =
      source === "streamtape"
        ? "streamtape"
        : source === "putarin"
          ? "putarin"
          : "lulu";
    const searched = await listSearch(q, 1, 400);
    items = searched.items.slice();
  }

  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }

  const take = items.slice(0, n);
  if (!take.length) {
    const label = cat || source || (wantAll ? "katalog" : "filter");
    await tgSend(token, chatId, `Kosong: ${label}. Coba yang lain.`, {
      reply_markup: MAIN_KEYBOARD,
    });
    return;
  }

  const body = take
    .map((v) => `▶ ${v.title}\n${HOST}/v/${v.id}`)
    .join("\n\n");
  await tgSend(token, chatId, body, { reply_markup: MAIN_KEYBOARD });
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
      "❌ Tidak ada link Streamtape / Putarin yang valid.\n\nKirim link lengkap, atau pakai tombol menu.",
      { reply_markup: MAIN_KEYBOARD }
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

    try {
      const result = await upsertVideoToGithub(env, fileName, record);
      if (!result.ok) {
        lines.push(`⚠️ Gagal upload: ${result.reason || "unknown"}`);
        continue;
      }
      const mark = result.action === "created" ? "✅" : "♻️";
      const label = result.action === "created" ? "BERHASIL diupload" : "DIUPDATE";
      const extra = result.rotated ? `\nArsip penuh → data/${result.rotated}` : "";
      lines.push(
        [
          `${mark} ${label}`,
          `Judul: ${record.title}`,
          `ID: ${record.id}`,
          `Source: ${record.source}`,
          `Kategori: ${record.category}`,
          `JSON: data/${result.file}`,
          `Total di chunk: ${result.total}`,
        ].join("\n") + extra
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`⚠️ Gagal push GitHub: ${msg}`);
    }
  }

  await tgSend(
    token,
    chatId,
    lines.join("\n\n") || "Tidak ada yang diproses.",
    { reply_markup: MAIN_KEYBOARD }
  );
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
        "Bot aktif.",
        "",
        "📤 Upload: kirim link Streamtape / Putarin",
        "📥 Minta: tekan tombol di bawah",
      ].join("\n"),
      { reply_markup: MAIN_KEYBOARD }
    );
    return Response.json({ ok: true });
  }

  const hasUploadLink =
    /streamtape\.com|putarin\.com|strcloud|lulustream|lulu\.st/i.test(text) &&
    /https?:\/\//i.test(text);

  if (hasUploadLink) {
    await handleUpload(token, chatId, text);
    return Response.json({ ok: true });
  }

  if (isMenuText(low)) {
    await handleShare(token, chatId, text);
    return Response.json({ ok: true });
  }

  await tgSend(
    token,
    chatId,
    "Kirim link untuk upload, atau tekan tombol menu.",
    { reply_markup: MAIN_KEYBOARD }
  );
  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/telegram")({
  server: {
    handlers: {
      GET: async () => {
        const env = process.env;
        const has = (k: string) => Boolean(String(env[k] || "").trim());
        const token = String(env.GH_TOKEN || env.GITHUB_TOKEN || "").trim();
        const ghOwner = String(env.GH_OWNER || env.GITHUB_OWNER || "").trim();
        const ghRepo = String(env.GH_REPO || env.GITHUB_REPO || "").trim();
        let ghAccess: string = "unknown";
        let ghPrivate: boolean | null = null;
        if (token && ghOwner && ghRepo) {
          try {
            const r = await fetch(
              `https://api.github.com/repos/${ghOwner}/${ghRepo}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: "application/vnd.github+json",
                  "User-Agent": "kdp-bot-diag",
                },
              }
            );
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
          host: HOST,
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
