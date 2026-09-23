import { createFileRoute } from "@tanstack/react-router";

/**
 * Approximate live presence.
 * In-memory per isolate (Cloudflare/Vercel) — cukup akurat untuk badge UI.
 * Session dianggap online selama ~45 detik sejak heartbeat terakhir.
 */

type Store = Map<string, number>;

declare global {
  // eslint-disable-next-line no-var
  var __drPinguinOnline: Store | undefined;
}

const TTL_MS = 45_000;

function store(): Store {
  if (!globalThis.__drPinguinOnline) {
    globalThis.__drPinguinOnline = new Map();
  }
  return globalThis.__drPinguinOnline;
}

function prune(now: number) {
  const s = store();
  for (const [id, ts] of s) {
    if (now - ts > TTL_MS) s.delete(id);
  }
}

function countOnline(): number {
  const now = Date.now();
  prune(now);
  return store().size;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

async function handlePost(request: Request): Promise<Response> {
  let id = "";
  try {
    const body = (await request.json()) as { id?: string };
    id = typeof body?.id === "string" ? body.id.trim().slice(0, 64) : "";
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return json({ ok: false, error: "bad_id" }, 400);
  }
  const now = Date.now();
  const s = store();
  s.set(id, now);
  prune(now);
  return json({ ok: true, count: s.size });
}

function handleGet(): Response {
  return json({ ok: true, count: countOnline() });
}

export const Route = createFileRoute("/api/online")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        }),
      GET: async () => handleGet(),
      POST: async ({ request }) => handlePost(request),
    },
  },
});
