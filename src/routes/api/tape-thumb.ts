import { createFileRoute } from "@tanstack/react-router";

/**
 * Streamtape thumbnail proxy — selalu HTTP 200 image/*
 * (302 ditolak Google: "Thumbnail tidak dapat dijangkau")
 */

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

async function fetchStreamtapeThumbUrl(fileId: string): Promise<string | null> {
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
    /* ignore */
  }
  return null;
}

async function proxyImage(url: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        accept: "image/*,*/*",
        "user-agent": "Mozilla/5.0 (compatible; KDPThumb/1.0)",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!type.startsWith("image/")) return null;
    const body = await res.arrayBuffer();
    if (!body.byteLength || body.byteLength < 100) return null;
    return { body, type };
  } catch {
    return null;
  }
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

        const thumbUrl = await fetchStreamtapeThumbUrl(id);
        if (thumbUrl) {
          const proxied = await proxyImage(thumbUrl);
          if (proxied) {
            return new Response(proxied.body, {
              status: 200,
              headers: {
                "content-type": proxied.type,
                "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
                "x-thumb-source": "streamtape-proxy",
              },
            });
          }
        }

        return new Response(null, {
          status: 302,
          headers: {
            location: "https://koleksidrpinguin.com/og.jpg",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
