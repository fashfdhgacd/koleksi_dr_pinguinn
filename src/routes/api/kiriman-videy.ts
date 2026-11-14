import { createFileRoute } from "@tanstack/react-router";
import { resolveAnalyticsKV, type KVNamespaceLike } from "@/lib/analytics-kv";
import { isOwnerRequest } from "@/lib/owner-auth";
import { MAIN_SITE } from "@/lib/satelit/config";
import {
  KIRIMAN_IP_PREFIX,
  KIRIMAN_IP_TTL_SEC,
  KIRIMAN_PENDING_CAP,
  KIRIMAN_QUEUE_KEY,
  KIRIMAN_SITE,
  type KirimanItem,
  classifyUploadResult,
  decideKiriman,
  idsFromCatalogItem,
  inspectPublicBody,
  isKirimanId,
  parseQueue,
} from "@/lib/kiriman-videy";

/**
 * POST /api/kiriman-videy
 * Public body: { url, title?, site: "videyy.icu", hp? }
 *   200 { ok:true, status:"pending" | "duplicate" }
 *   400 { ok:false, error:"invalid_url" }
 *   429 { ok:false, error:"rate_limited" }
 * A non-empty hp is a honeypot: 200 { ok:true } and nothing is stored.
 * Owner (x-online-key), same endpoint the /pemilik panel uses:
 *   GET list, POST { action:"approve"|"reject"|"reject-all", id? }
 * KV is written only when a new pending item is stored, or when the owner approves/rejects.
 */

const ALLOWED_ORIGINS = new Set(["https://videyy.icu", "https://videqsss.icu"]);

function json(request: Request, data: unknown, status = 200): Response {
  const headers: Record<string, string> = {
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
  };
  const origin = request.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
  }
  return Response.json(data, { status, headers });
}

function preflight(request: Request): Response {
  const origin = request.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["access-control-allow-origin"] = origin;
  return new Response(null, { status: 204, headers });
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function ipStorageKey(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`kiriman-videy:${ip}`));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${KIRIMAN_IP_PREFIX}${hex.slice(0, 32)}`;
}

async function kvHandle(): Promise<KVNamespaceLike | null> {
  const resolved = await resolveAnalyticsKV();
  return resolved?.kv || null;
}

async function catalogIds(): Promise<string[]> {
  const { loadItemsRaw } = await import("@/lib/catalog/local-cache");
  const bag = (await loadItemsRaw()) as {
    items?: { id?: unknown; embed?: unknown; direct?: unknown }[];
    raw?: { id?: unknown; embed?: unknown; direct?: unknown }[];
  };
  const items = bag.raw || bag.items || [];
  const ids: string[] = [];
  for (const item of items) ids.push(...idsFromCatalogItem(item));
  return ids;
}

async function readPending(kv: KVNamespaceLike): Promise<KirimanItem[] | null> {
  const raw = await kv.get(KIRIMAN_QUEUE_KEY);
  return parseQueue(raw);
}

async function writePending(kv: KVNamespaceLike, items: KirimanItem[]): Promise<void> {
  await kv.put(KIRIMAN_QUEUE_KEY, JSON.stringify(items));
}

function toPublic(item: KirimanItem) {
  const safe = item.id.replace(/[^A-Za-z0-9_-]/g, "");
  return {
    id: item.id,
    url: item.url,
    title: item.title,
    site: item.site,
    at: item.at,
    thumb: `/videy-thumbs/${safe}.jpg`,
  };
}

async function listForOwner(request: Request): Promise<Response> {
  if (!(await isOwnerRequest(request))) return json(request, { ok: false, error: "forbidden" }, 403);
  const kv = await kvHandle();
  if (!kv) return json(request, { ok: false, error: "rate_limited" }, 429);
  const items = await readPending(kv);
  if (!items) return json(request, { ok: false, error: "rate_limited" }, 429);
  return json(request, { ok: true, count: items.length, items: items.map(toPublic) });
}

async function ownerAct(request: Request, body: Record<string, unknown>): Promise<Response> {
  if (!(await isOwnerRequest(request, body.key))) return json(request, { ok: false, error: "forbidden" }, 403);
  const action = body.action;
  const kv = await kvHandle();
  if (!kv) return json(request, { ok: false, error: "rate_limited" }, 429);
  const items = await readPending(kv);
  if (!items) return json(request, { ok: false, error: "rate_limited" }, 429);

  if (action === "reject-all") {
    if (items.length) await writePending(kv, []);
    return json(request, { ok: true, removed: items.length });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!isKirimanId(id)) return json(request, { ok: false, error: "invalid_url" }, 400);
  const item = items.find((row) => row.id.toLowerCase() === id.toLowerCase());
  if (!item) return json(request, { ok: false, error: "not_found" }, 404);

  if (action === "reject") {
    await writePending(
      kv,
      items.filter((row) => row.id.toLowerCase() !== id.toLowerCase()),
    );
    return json(request, { ok: true, id: item.id });
  }

  if (action === "approve") {
    let outcome: { ok: boolean; stored: boolean; status?: "saved" | "exists"; text: string };
    try {
      outcome = await approveIntoCatalog(item);
    } catch {
      return json(request, { ok: false, error: "upload_failed" }, 502);
    }
    if (outcome.stored) {
      const fresh = await readPending(kv);
      if (fresh) {
        await writePending(
          kv,
          fresh.filter((row) => row.id.toLowerCase() !== item.id.toLowerCase()),
        );
      }
    }
    if (!outcome.ok) return json(request, { ok: false, error: "upload_failed", text: outcome.text }, 502);
    return json(request, { ok: true, id: item.id, status: outcome.status, text: outcome.text });
  }

  return json(request, { ok: false, error: "invalid_url" }, 400);
}

/**
 * Same upload the owner panel uses for a Videy paste (processUploadBatch), then the
 * per-site skip list from the satellite settings: videyy.icu stays, videqsss.icu is excluded.
 * An empty title keeps the existing automatic Videy naming.
 */
async function approveIntoCatalog(item: KirimanItem): Promise<{ ok: boolean; stored: boolean; status?: "saved" | "exists"; text: string }> {
  const safeTitle = item.title.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  const text = safeTitle ? `Judul: ${safeTitle}\n${item.url}` : item.url;
  const lines: string[] = [];
  const { processUploadBatch } = await import("@/lib/bot/upload-handler.js");
  const result = (await processUploadBatch({
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
  })) as { created?: { id?: string; title?: string }[] } | undefined;
  const created = Array.isArray(result?.created) ? result.created : [];
  const joined = lines.filter(Boolean).join("\n");
  const outcome = classifyUploadResult(lines, created.length);
  if (outcome === "failed") return { ok: false, stored: false, text: joined.slice(0, 500) || "Gagal memasukkan video." };
  try {
    const { selectionFromHosts } = await import("@/lib/satelit/config");
    const { applyUploadSites } = await import("@/lib/satelit/store");
    const selection = selectionFromHosts([MAIN_SITE, KIRIMAN_SITE]);
    if (selection) {
      await applyUploadSites([{ id: item.id, title: item.title, host: "videy" }], selection);
    }
  } catch {
    return {
      ok: false,
      stored: true,
      text: `${joined}\nVideo masuk, tetapi pengaturan situs gagal disimpan.`.trim().slice(0, 500),
    };
  }
  return { ok: true, stored: true, status: outcome === "exists" ? "exists" : "saved", text: joined.slice(0, 500) };
}

async function publicSubmit(request: Request, body: unknown): Promise<Response> {
  const inspected = inspectPublicBody(body);
  if (inspected.kind === "drop") return json(request, { ok: true });
  if (inspected.kind === "invalid") return json(request, { ok: false, error: "invalid_url" }, 400);

  const kv = await kvHandle();
  if (!kv) return json(request, { ok: false, error: "rate_limited" }, 429);
  const ipKey = await ipStorageKey(clientIp(request));
  let pending: KirimanItem[] | null;
  let catalog: string[];
  let ipRaw: string | null;
  try {
    [pending, ipRaw, catalog] = await Promise.all([readPending(kv), kv.get(ipKey), catalogIds()]);
  } catch {
    return json(request, { ok: false, error: "rate_limited" }, 429);
  }
  if (!pending) return json(request, { ok: false, error: "rate_limited" }, 429);
  const ipCount = Math.max(0, Math.floor(Number(ipRaw) || 0));
  const decision = decideKiriman({
    id: inspected.id,
    pendingIds: pending.map((row) => row.id),
    catalogIds: catalog,
    pendingCount: pending.length,
    ipCount,
  });
  if (decision === "duplicate") return json(request, { ok: true, status: "duplicate" });
  if (decision === "rate_limited") return json(request, { ok: false, error: "rate_limited" }, 429);

  const next: KirimanItem = {
    id: inspected.id,
    url: inspected.url,
    title: inspected.title,
    site: KIRIMAN_SITE,
    at: Date.now(),
  };
  try {
    await writePending(kv, [next, ...pending].slice(0, KIRIMAN_PENDING_CAP));
  } catch {
    return json(request, { ok: false, error: "rate_limited" }, 429);
  }
  try {
    await kv.put(ipKey, String(ipCount + 1), { expirationTtl: KIRIMAN_IP_TTL_SEC });
  } catch {
    /* The item is already stored. A missed counter only allows a few extra submits. */
  }
  return json(request, { ok: true, status: "pending" });
}

export const Route = createFileRoute("/api/kiriman-videy")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => preflight(request),
      GET: async ({ request }) => listForOwner(request),
      POST: async ({ request }) => {
        const len = Number(request.headers.get("content-length") || 0);
        if (len > 8192) return json(request, { ok: false, error: "invalid_url" }, 400);
        let text = "";
        try {
          text = await request.text();
        } catch {
          return json(request, { ok: false, error: "invalid_url" }, 400);
        }
        if (text.length > 8192) return json(request, { ok: false, error: "invalid_url" }, 400);
        let body: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(text) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return json(request, { ok: false, error: "invalid_url" }, 400);
          }
          body = parsed as Record<string, unknown>;
        } catch {
          return json(request, { ok: false, error: "invalid_url" }, 400);
        }
        if (typeof body.action === "string" && body.action) return ownerAct(request, body);
        return publicSubmit(request, body);
      },
    },
  },
});
