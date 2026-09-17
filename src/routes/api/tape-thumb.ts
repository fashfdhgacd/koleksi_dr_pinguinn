import { createFileRoute } from "@tanstack/react-router";

/**
 * Self-hosted Streamtape thumbnail proxy.
 * Uses STREAMTAPE_LOGIN + STREAMTAPE_KEY from env when available.
 * Falls back to a 1x1 transparent pixel so the UI never depends on .site.
 */

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

async function fetchStreamtapeThumb(fileId: string): Promise<string | null> {
  const login = env("STREAMTAPE_LOGIN");
  const key = env("STREAMTAPE_KEY");
  if (!login || !key) return null;

  try {
    const url = new URL("https://api.streamtape.com/file/getsplash");
    url.searchParams.set("login", login);
    url.searchParams.set("key", key);
    url.searchParams.set("file", fileId);

    const res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: number; result?: string };
    if (data.status === 200 && typeof data.result === "string" && data.result.startsWith("http")) {
      return data.result;
    }
  } catch {
    /* timeout / network — fallback placeholder, jangan biarkan function error */
  }
  return null;
}

export const Route = createFileRoute("/api/tape-thumb")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id")?.trim() || "";
        if (!id || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) {
          return new Response(TRANSPARENT_GIF, {
            status: 400,
            headers: {
              "content-type": "image/gif",
              "cache-control": "private, no-store",
            },
          });
        }

        const thumbUrl = await fetchStreamtapeThumb(id);
        if (thumbUrl) {
          // Redirect so CDN/browser can cache the real image
          return new Response(null, {
            status: 302,
            headers: {
              location: thumbUrl,
              "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
            },
          });
        }

        // No credentials / API failed → transparent placeholder (cache lebih lama biar tidak spam function)
        return new Response(TRANSPARENT_GIF, {
          status: 200,
          headers: {
            "content-type": "image/gif",
            "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
