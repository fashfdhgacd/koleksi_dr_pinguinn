import { loadItems } from "../../src/lib/catalog/local-cache";
import { isNewUpload } from "../../src/lib/catalog/feed-order";
import { SITE_ORIGIN } from "../../src/lib/seo";

export function reviewEmbed(value: string): string | undefined {
  if (/^https:\/\/tv1\.(?:indoav\.app|userbokep\.com)\/e\/[\w-]+\/?$/.test(value)) return value;
}

export function hasReviewNotice(html: string): boolean {
  const body = html.replace(/<!--[\s\S]*?-->|<(script|style|head|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>|&nbsp;/gi, " ").replace(/\s+/g, " ");
  return /\bpending review\b/i.test(body) && !/\b(?:not|no longer) pending review\b/i.test(body);
}

export default async function providerReview(event: { url: URL; req: Request }, next: () => unknown) {
  const match = /^\/api\/provider-review\/([\w-]{1,80})$/.exec(event.url.pathname);
  if (!match || event.req.method !== "GET") return next();
  const key = new Request(SITE_ORIGIN + event.url.pathname);
  const edge = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const hit = await edge?.match(key).catch(() => undefined);
  if (hit) return hit;
  const { byId } = await loadItems();
  const item = byId.get(match[1]);
  const embed = item && isNewUpload(item) && reviewEmbed(String(item.embed || item.direct || ""));
  if (!embed) return Response.json({ pending: false }, { headers: { "cache-control": "no-store" } });
  let pending = false;
  try {
    const res = await fetch(embed, { redirect: "error", signal: AbortSignal.timeout(3500) });
    if (res.ok && res.headers.get("content-type")?.includes("text/html")) pending = hasReviewNotice(await res.text());
  } catch {
    // Timeout or challenge: no confirmed status to display.
  }
  const response = Response.json({ pending }, { headers: { "cache-control": "public, max-age=120" } });
  await edge?.put(key, response.clone()).catch(() => undefined);
  return response;
}
