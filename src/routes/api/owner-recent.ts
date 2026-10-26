import { createFileRoute } from "@tanstack/react-router";
import { isOwnerKey, ownerKeyFrom, ownerSecret } from "@/lib/owner-auth";
import { hiddenReasonRaw, loadItemsRaw } from "@/lib/catalog/local-cache";
import type { RawItem } from "@/lib/catalog/local-shared";
import { mergeChunks } from "@/lib/catalog/chunk-contract.js";
import latestVideosIndex from "../../../data/videos-latest-index.json";
import latestPutarinIndex from "../../../data/putarin-latest-index.json";
// Chunked bot feeds (contract: src/lib/catalog/chunk-contract.js). Every chunk is bundled and
// ordered by its -index.json; scripts/check-catalog.mjs fails the build if one goes missing.
const latestVideos: unknown[] = mergeChunks(
  import.meta.glob<unknown>("../../../data/videos-latest*.json", { eager: true, import: "default" }),
  latestVideosIndex,
  "videos-latest",
);
const latestPutarin: unknown[] = mergeChunks(
  import.meta.glob<unknown>("../../../data/putarin-latest*.json", { eager: true, import: "default" }),
  latestPutarinIndex,
  "putarin-latest",
);

/**
 * Owner-only "Baru masuk": newest Telegram uploads from the bundled bot files
 * (data/putarin-latest.json, data/videos-latest.json) with their status in the live catalog.
 * Reads only bundled data and the in-memory catalog, so no D1/KV/GitHub calls.
 */
const LIMIT = 80;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

function asList(v: unknown): RawItem[] {
  return Array.isArray(v) ? (v as RawItem[]).filter((x) => x && typeof x.id === "string" && x.id) : [];
}

function stamp(it: RawItem): string {
  const r = it as { updated_at?: unknown; createdAt?: unknown; date?: unknown };
  return String(r.updated_at || r.createdAt || r.date || "");
}

export const Route = createFileRoute("/api/owner-recent")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!ownerSecret()) return json({ ok: false, error: "not_configured" }, 503);
        if (!(await isOwnerKey(ownerKeyFrom(request)))) return json({ ok: false, error: "forbidden" }, 403);
        const cache = await loadItemsRaw();
        const rows = [
          ...asList(latestPutarin).map((it) => ({ it, host: "Putarin" })),
          ...asList(latestVideos).map((it) => ({ it, host: /videy/i.test(`${it.source || ""} ${it.embed || ""} ${it.direct || ""}`) ? "Videy" : String(it.source || "Lain") })),
        ]
          .sort((a, b) => stamp(b.it).localeCompare(stamp(a.it)))
          .slice(0, LIMIT)
          .map(({ it, host }) => {
            const live = cache.byId.has(it.id);
            const reason = live ? "" : hiddenReasonRaw(it);
            return {
              id: it.id,
              title: String(it.title || it.id),
              host,
              at: stamp(it),
              status: live ? "live" : reason ? "hidden" : "pending",
              reason,
            };
          });
        const putarinTotal = asList(latestPutarin).length;
        const videosTotal = asList(latestVideos).length;
        return json({ ok: true, rows, putarinTotal, videosTotal });
      },
    },
  },
});
