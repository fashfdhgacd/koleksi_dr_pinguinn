import { createFileRoute } from "@tanstack/react-router";
import { recordHit, touchOnline } from "@/lib/owner-analytics";

const last = new Map<string, number>();

export const Route = createFileRoute("/api/analytics/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, string> = {};
        try {
          body = (await request.json()) as Record<string, string>;
        } catch {
          return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
        }
        const id = String(body.id || body.sessionId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
        if (!id) return Response.json({ ok: false, error: "bad_id" }, { status: 400 });
        const now = Date.now();
        const prev = last.get(id) || 0;
        if (now - prev < 15_000) return Response.json({ ok: true, deduped: true });
        last.set(id, now);
        await touchOnline(id);
        if (body.path) {
          await recordHit({
            path: String(body.path).slice(0, 200),
            ref: String(body.ref || body.referrer || ""),
            ua: request.headers.get("user-agent") || "",
            host: String(body.host || request.headers.get("host") || ""),
            sessionId: id,
            visitorId: String(body.visitorId || id).slice(0, 64),
            eventId: String(body.eventId || "").slice(0, 80),
          });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
