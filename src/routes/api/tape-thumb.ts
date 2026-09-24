import { createFileRoute } from "@tanstack/react-router";
import postersMap from "../../lib/catalog/posters.json";
import latestPosters from "../../../data/latest-posters.json";

/**
 * Streamtape thumbnail proxy — prioritaskan gambar nyata, fallback berlapis.
 * Urutan:
 *  1) getsplash (butuh STREAMTAPE_LOGIN + STREAMTAPE_KEY)
 *  2) file/info → result.thumb (sering jalan tanpa key)
 *  3) posters.json / latest-posters.json
 *  4) brand poster (selalu 200 image, jangan 302/gif kosong)
 */

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const BRAND_URL = "https://koleksidrpinguin.com/brand-poster.jpg";

const POSTERS: Record<string, string> = {
  ...(typeof postersMap === "object" && postersMap && !Array.isArray(postersMap)
    ? (postersMap as Record<string, string>)
    : {}),
  ...(typeof latestPosters === "object" && latestPosters && !Array.isArray(latestPosters)
    ? (latestPosters as Record<string, string>)
    : {}),
};

function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

async function fromGetSplash(fileId: string): Promise<string | null> {
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

/** file/info sering mengembalikan thumb publik tanpa login. */
async function fromFileInfo(fileId: string): Promise<string | null> {
  try {
    const login = env("STREAMTAPE_LOGIN");
    const key = env("STREAMTAPE_KEY");
    const url = new URL("https://api.streamtape.com/file/info");
    url.searchParams.set("file", fileId);
    if (login && key) {
      url.searchParams.set("login", login);
      url.searchParams.set("key", key);
    }
    const res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: number;
      result?: Record<string, { thumb?: string }> | { thumb?: string };
    };
    if (data.status !== 200 || !data.result) return null;
    const info =
      typeof data.result === "object" && data.result !== null && fileId in data.result
        ? (data.result as Record<string, { thumb?: string }>)[fileId]
        : (data.result as { thumb?: string });
    const thumb = String(info?.thumb || "").trim();
    if (thumb.startsWith("http")) return thumb;
  } catch {
    /* ignore */
  }
  return null;
}

function fromPostersMap(fileId: string): string | null {
  const v = POSTERS[fileId];
  if (typeof v === "string" && v.startsWith("http") && !/placeholder/i.test(v)) return v;
  return null;
}

async function resolveThumbUrl(fileId: string): Promise<{ url: string; source: string } | null> {
  const splash = await fromGetSplash(fileId);
  if (splash) return { url: splash, source: "getsplash" };

  const info = await fromFileInfo(fileId);
  if (info) return { url: info, source: "file-info" };

  const mapped = fromPostersMap(fileId);
  if (mapped) return { url: mapped, source: "posters-map" };

  return null;
}

async function proxyImage(url: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; KDPThumb/1.1)",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!type.startsWith("image/")) return null;
    const body = await res.arrayBuffer();
    if (!body.byteLength || body.byteLength < 200) return null;
    return { body, type };
  } catch {
    return null;
  }
}

async function brandImage(): Promise<Response> {
  const proxied = await proxyImage(BRAND_URL);
  if (proxied) {
    return new Response(proxied.body, {
      status: 200,
      headers: {
        "content-type": proxied.type,
        "cache-control": "public, max-age=3600",
        "x-thumb-source": "brand",
      },
    });
  }
  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "content-type": "image/gif",
      "cache-control": "public, max-age=60",
      "x-thumb-source": "empty",
    },
  });
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

        const resolved = await resolveThumbUrl(id);
        if (resolved) {
          const proxied = await proxyImage(resolved.url);
          if (proxied) {
            return new Response(proxied.body, {
              status: 200,
              headers: {
                "content-type": proxied.type,
                "cache-control":
                  "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000",
                "x-thumb-source": resolved.source,
              },
            });
          }
        }

        // Jangan 302 — browser/VideoThumb sering gagal & tampil brand kosong.
        return brandImage();
      },
    },
  },
});
