import { decodePublicPath, localizedPath } from "../../src/lib/public-locale.ts";
/**
 * URL template /watch/$id (atau /watch/:id, /watch/{id}) yang sempat terindeks → 302 ke beranda + noindex.
 * Hidden / blocked / rejected ids (minor/school, owner hide, catalog block) → 302 ke beranda + noindex
 * (video tidak dihidupkan lagi; pengunjung masuk ke situs, bukan halaman teks "Gone").
 * Template /kategori/$slug yang bocor dari manifest router → 302 ke /kategori + noindex.
 * Trailing slash (mis. /kategori/) → satu kali 301 ke versi tanpa slash.
 * Multi-server: id salinan yang digabung ke halaman utama yang masih publik (multi-server.ts) → 301
 * ke /watch/<utama>. Kalau halaman utamanya juga tersembunyi, 302 ke beranda.
 */
import { isPublicHidden, mergedMainOf } from "../../src/lib/catalog/local-cache";
import {
  WATCH_ID_RE,
  decideWatchPlaceholder,
  decisionResponse,
  type WatchIdInfo,
} from "../lib/watch-placeholder-decide";

interface WatchPlaceholderEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

export default async function watchPlaceholderMiddleware(
  event: WatchPlaceholderEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  let malformed = false;
  try {
    decodeURIComponent(event.url.pathname);
  } catch {
    malformed = true;
  }
  if (malformed) {
    return new Response("Bad Request", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" },
    });
  }

  const { path, language } = decodePublicPath(event.url.pathname);
  const method = event.req.method;
  let info: WatchIdInfo | null = null;
  const m = path.match(WATCH_ID_RE);
  if (m) {
    try {
      const id = m[1];
      const main = method === "GET" || method === "HEAD" ? await mergedMainOf(id) : null;
      const target = main && main !== id ? main : id;
      info = { targetHidden: await isPublicHidden(target), main };
    } catch {
      /* catalog unavailable: let the page decide */
    }
  }

  const decision = decideWatchPlaceholder(path, method, event.url.search, info);
  return decisionResponse(decision) ?? next();
}
