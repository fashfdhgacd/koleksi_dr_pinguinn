import { createFileRoute } from "@tanstack/react-router";
import {
  countOnline,
  getOwnerStats,
  maybeTelegramAlert,
  recordHit,
  touchOnline,
} from "@/lib/owner-analytics";

function viewSecret(): string {
  // Cloudflare Workers + Nitro + Vercel all surface as process.env when bound
  const a = (process.env.ONLINE_VIEW_SECRET || "").trim();
  if (a) return a;
  // fallback aliases if user set alternate name
  return (
    process.env.OWNER_SECRET ||
    process.env.PEMILIK_SECRET ||
    ""
  ).trim();
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
  let path = "";
  let ref = "";
  let host = "";
  try {
    const body = (await request.json()) as {
      id?: string;
      key?: string;
      path?: string;
      ref?: string;
      host?: string;
    };
    id = typeof body?.id === "string" ? body.id.trim().slice(0, 64) : "";
    bodyKey = typeof body?.key === "string" ? body.key : "";
    path = typeof body?.path === "string" ? body.path : "";
    ref = typeof body?.ref === "string" ? body.ref : "";
    host = typeof body?.host === "string" ? body.host : "";
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return json({ ok: false, error: "bad_id" }, 400);
  }

  const ua = request.headers.get("user-agent") || "";
  const count = touchOnline(id);

  if (path) {
    recordHit({
      path,
      ref: ref || request.headers.get("referer") || "",
      ua,
      host: host || request.headers.get("host") || "",
    });
  }

  void maybeTelegramAlert(count);

  if (!isOwnerKey(extractKey(request, bodyKey))) {
    return json({ ok: true });
  }
  return json({ ok: true, owner: true, ...getOwnerStats() });
}

function handleGet(request: Request): Response {
  const secret = viewSecret();
  if (!secret) {
    return json(
      {
        ok: false,
        error: "not_configured",
        hint: "Set ONLINE_VIEW_SECRET di Cloudflare (domain .com) lalu redeploy.",
      },
      503,
    );
  }
  if (!isOwnerKey(extractKey(request))) {
    return json({ ok: false, error: "forbidden" }, 403);
  }
  countOnline();
  return json({ ok: true, owner: true, ...getOwnerStats() });
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
