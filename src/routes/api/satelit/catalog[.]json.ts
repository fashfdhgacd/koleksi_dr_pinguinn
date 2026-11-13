import { createFileRoute } from "@tanstack/react-router";

/**
 * Public read-only export of the published catalog for the satellite sites (videyy.icu,
 * videqsss.icu). Their daily GitHub Action (vidy scripts/videyy-sync.mjs) fetches this once a day;
 * the main repo is private, so this is the only way that job can see new uploads.
 *
 * Only videos that are live here (hidden / blocked / review-held rows are already filtered out of
 * `items`), so the hidden flags are dropped from the export. Bundled data + CPU only: no KV write,
 * no new env var. The edge cache (scripts/cf-worker-entry.mjs) serves repeats for an hour.
 */
const CACHE = "public, max-age=300, s-maxage=3600";

const KEEP = [
  "id",
  "title",
  "embed",
  "direct",
  "source",
  "creator",
  "category",
  "tags",
  "date",
  "createdAt",
  "updated_at",
  "duration",
  "poster",
  "thumbnail",
  "code",
] as const;

function json(data: unknown, status = 200): Response {
  const cache = status === 200 ? CACHE : "no-store";
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      "cdn-cache-control": cache,
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export const Route = createFileRoute("/api/satelit/catalog.json")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { loadItems } = await import("@/lib/catalog/local");
          const cache = await loadItems();
          const items = cache.items.map((it) => {
            const row: Record<string, unknown> = {};
            for (const k of KEEP) if (it[k] != null && it[k] !== "") row[k] = it[k];
            const poster = cache.posters?.[it.id];
            if (!row.poster && poster) row.poster = poster;
            if (!row.thumbnail && row.poster) row.thumbnail = row.poster;
            return row;
          });
          return json({ ok: true, version: 1, generatedAt: new Date().toISOString(), count: items.length, items });
        } catch {
          return json({ ok: false, error: "unavailable" }, 503);
        }
      },
    },
  },
});
