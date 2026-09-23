import { createFileRoute } from "@tanstack/react-router";

/**
 * Live presence — count HANYA untuk pemilik.
 * - POST tanpa key: catat heartbeat saja (tanpa angka)
 * - POST/GET dengan key = ONLINE_VIEW_SECRET: dapat { count }
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

function viewSecret(): string {
  return (process.env.ONLINE_VIEW_SECRET || "").trim();
}

function isOwnerKey(key: string | null | undefined): boolean {
  const secret = viewSecret();
  if (!secret || !key) return false;
  return key.trim() === secret;
}

function extractKey(request: Request, bodyKey?: string): string {
  const header = request.headers.get("x-online-key") || "";
  if (header) return header;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("key") || url.searchParams.get("k") || "";
    if (q) return q;
  } catch {
    /* ignore */
  }
  return bodyKey || "";
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-online-key",
    },
  });
}

async function handlePost(request: Request): Promise<Response> {
  let id = "";
  let bodyKey = "";
  try {
    const body = (await request.json()) as { id?: string; key?: string };
    id = typeof body?.id === "string" ? body.id.trim().slice(0, 64) : "";
    bodyKey = typeof body?.key === "string" ? body.key : "";
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

  // Publik: cuma acknowledge, TANPA angka
  if (!isOwnerKey(extractKey(request, bodyKey))) {
    return json({ ok: true });
  }
  return json({ ok: true, count: s.size, owner: true });
}

function handleGet(request: Request): Response {
  if (!isOwnerKey(extractKey(request))) {
    return json({ ok: false, error: "forbidden" }, 403);
  }
  return json({ ok: true, count: countOnline(), owner: true });
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
            "access-control-allow-headers": "content-type, x-online-key",
          },
        }),
      GET: async ({ request }) => handleGet(request),
      POST: async ({ request }) => handlePost(request),
    },
  },
});
