import { createFileRoute } from "@tanstack/react-router";
import { collectSharePool } from "@/lib/bot/share-pool";
import { loadShareUsed, saveShareUsed } from "@/lib/bot/share-used";
import { processUploadBatch } from "@/lib/bot/upload-handler.js";
import {
  cleanPosterId,
  isHttpPoster,
  mergeLatestPosters,
  refreshMissingPosters,
} from "@/lib/bot/posters.js";

export const maxDuration = 60;

const HOST = "https://koleksidrpinguin.com";

function viewSecret(): string {
  const a = (process.env.ONLINE_VIEW_SECRET || "").trim();
  if (a) return a;
  return (process.env.OWNER_SECRET || process.env.PEMILIK_SECRET || "").trim();
}

function isOwner(request: Request): boolean {
  const secret = viewSecret();
  const key = (request.headers.get("x-online-key") || "").trim();
  return Boolean(secret && key && key === secret);
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

async function handleShare(body: { count?: number; category?: string; source?: string }) {
  const usedFile = await loadShareUsed();
  const n = Math.min(100, Math.max(1, Number(body.count) || 100));
  const cat = String(body.category || "").trim();
  const source = String(body.source || "").trim();
  const picked = await collectSharePool({
    count: n,
    category: cat,
    source,
    excludeIds: usedFile.used,
    excludeTitles: usedFile.titles,
  });
  if (!picked.items.length) {
    return json({ ok: true, count: 0, text: "Kosong. Coba kategori lain.", reset: false });
  }
  const take = picked.items;
  await saveShareUsed({
    resetAt: picked.reset ? Date.now() : usedFile.resetAt,
    used: picked.reset
      ? take.map((v) => String(v.id))
      : usedFile.used.concat(take.map((v) => String(v.id))),
    titles: picked.reset
      ? take.map((v) => String(v.title || ""))
      : (usedFile.titles || []).concat(take.map((v) => String(v.title || ""))),
    lastCat: cat,
    lastSource: source,
    lastCount: n,
  });
  const text = take.map((v) => `▶ ${v.title}\n${HOST}/watch/${v.id}`).join("\n\n");
  return json({ ok: true, count: take.length, reset: picked.reset, text });
}

async function handleUpload(body: { text?: string; category?: string }) {
  const raw = String(body.text || "").trim();
  if (!raw) return json({ ok: false, error: "kosong" }, 400);
  const cat = String(body.category || "").trim();
  const text = cat ? `Kategori: ${cat}\n${raw}` : raw;
  const lines: string[] = [];
  await processUploadBatch({
    token: "panel",
    chatId: 0,
    text,
    env: process.env,
    tgSend: async (_token: string, _chat: number, msg: string) => {
      lines.push(msg);
      return true;
    },
    tgSendChunks: async (_token: string, _chat: number, msg: string) => {
      lines.push(msg);
    },
    MAIN_KEYBOARD: {},
  });
  return json({ ok: true, text: lines.filter(Boolean).join("\n\n") || "Selesai." });
}

async function handleSetPoster(body: { id?: string; url?: string }) {
  const id = cleanPosterId(body.id);
  const url = String(body.url || "").trim();
  if (!id) return json({ ok: false, error: "bad_id" }, 400);
  if (!isHttpPoster(url)) return json({ ok: false, error: "bad_url" }, 400);
  const merged = await mergeLatestPosters(process.env, { [id]: url });
  if (!merged.ok) return json({ ok: false, error: merged.error || "merge_failed" }, 502);
  return json({
    ok: true,
    id,
    url,
    added: merged.added,
    updated: merged.updated,
    total: merged.total,
    text:
      merged.added || merged.updated
        ? `Poster ${id} tersimpan. Map: ${merged.total} entri.`
        : `Poster ${id} sudah sama. Map: ${merged.total} entri.`,
  });
}

async function handleRefreshPosters(body: { limit?: number }) {
  const result = await refreshMissingPosters(process.env, { limit: body.limit });
  if (!result.ok) {
    return json({ ok: false, error: result.error || "refresh_failed", text: result.text }, 502);
  }
  return json(result);
}

type OwnerBody = {
  action?: string;
  count?: number;
  category?: string;
  source?: string;
  text?: string;
  id?: string;
  url?: string;
  limit?: number;
};

export const Route = createFileRoute("/api/owner-tools")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!viewSecret()) return json({ ok: false, error: "not_configured" }, 503);
        if (!isOwner(request)) return json({ ok: false, error: "forbidden" }, 403);
        let body: OwnerBody = {};
        try {
          body = (await request.json()) as OwnerBody;
        } catch {
          return json({ ok: false, error: "bad_json" }, 400);
        }
        if (body.action === "share") return handleShare(body);
        if (body.action === "upload") return handleUpload(body);
        if (body.action === "set-poster") return handleSetPoster(body);
        if (body.action === "refresh-posters") return handleRefreshPosters(body);
        return json({ ok: false, error: "bad_action" }, 400);
      },
    },
  },
});
