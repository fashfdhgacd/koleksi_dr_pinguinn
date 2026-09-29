import { createFileRoute } from "@tanstack/react-router";

const ALLOW =
  /^(tv1\.indoav\.app|www\.indoav\.com|indoav\.com)$/i;

function bad(status: number, msg: string) {
  return new Response(msg, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/frame")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let target: URL;
        try {
          const raw = new URL(request.url).searchParams.get("u") || "";
          target = new URL(raw);
        } catch {
          return bad(400, "bad_url");
        }
        if (target.protocol !== "https:") return bad(400, "https_only");
        if (!ALLOW.test(target.hostname)) return bad(403, "host_not_allowed");
        if (!/^\/(e|embed|v)\//i.test(target.pathname)) return bad(403, "path_not_allowed");

        let upstream: Response;
        try {
          upstream = await fetch(target.toString(), {
            headers: {
              accept: "text/html,application/xhtml+xml",
              "user-agent": request.headers.get("user-agent") || "Mozilla/5.0",
              referer: "https://koleksidrpinguin.com/",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(12000),
          });
        } catch {
          return bad(502, "upstream_fail");
        }

        const ctype = (upstream.headers.get("content-type") || "").toLowerCase();
        if (!ctype.includes("text/html")) {
          return new Response(upstream.body, {
            status: upstream.status,
            headers: {
              "content-type": ctype || "application/octet-stream",
              "cache-control": "private, max-age=60",
              "x-frame-options": "ALLOWALL",
            },
          });
        }

        let html = await upstream.text();
        if (!/<base\s/i.test(html)) {
          html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${target.origin}${target.pathname.endsWith("/") ? target.pathname : `${target.pathname}/`}">`);
        }

        return new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "private, max-age=120",
            "x-frame-options": "ALLOWALL",
            "content-security-policy": "frame-ancestors *",
          },
        });
      },
    },
  },
});
