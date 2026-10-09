/**
 * Read-only feeds for the 12-hour "Refresh folder stats" GitHub workflow.
 *
 * GET /api/folder-stats?f=<folder>&p=<page>
 *   IndoAV / UserBokep answer 403 to GitHub Actions runners, so the workflow could never crawl the
 *   owner's folders (every run: "give up ... updated 0"). The Worker fetches ONE public folder page
 *   and returns only the parsed numbers: {ok, items: [[code, views, durationSec, likes], ...]}.
 *   Only the owner's 3 folders (allow-list) and pages 1..2000; never an open proxy, never an embed
 *   or player URL (no view is counted: the folder list page has no player).
 *
 * GET /api/site-likes
 *   Our own visitor likes per video id (D1 video_likes, same KV-cached aggregate the ranking pages
 *   use). The workflow snapshots it into src/lib/catalog/site-likes.json so every card can show
 *   source likes + our likes. Public numbers only (the watch page shows the same counts).
 */

interface FeedEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

const FOLDERS: Record<string, string> = {
  "9DaQXgw7uFQs": "https://tv1.indoav.app",
  Z5B2P6lTlqi7: "https://tv1.userbokep.com",
  oGTW9gH3jfHf: "https://tv1.userbokep.com",
};

const UA =
  "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

function json(body: unknown, status = 200, cache = "no-store"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      "x-robots-tag": "noindex",
    },
  });
}

function num(v: string): number {
  const s = String(v || "").toLowerCase().replace(/,/g, ".").trim();
  const m = s.match(/^([\d.]+)\s*(k|rb|m|jt)?/);
  if (!m) return 0;
  const n = m[2] ? parseFloat(m[1]) : parseFloat(m[1].replace(/\./g, ""));
  if (!Number.isFinite(n)) return 0;
  const mul = m[2] === "k" || m[2] === "rb" ? 1e3 : m[2] === "m" || m[2] === "jt" ? 1e6 : 1;
  return Math.round(n * mul);
}

function dur(s: string): number {
  let t = 0;
  for (const m of String(s || "").matchAll(/(\d+)\s*([hms])/g)) {
    t += Number(m[1]) * (m[2] === "h" ? 3600 : m[2] === "m" ? 60 : 1);
  }
  return t;
}

function stat(block: string, icon: string): string {
  const re = new RegExp(`data-icon="${icon}">[\\s\\S]*?<span class="text-xs">([^<]+)</span>`);
  return block.match(re)?.[1]?.trim() || "";
}

/** Same parsing as scripts/refresh-folder-stats.py. */
function parseFolderPage(html: string): [string, number, number, number][] {
  const out: [string, number, number, number][] = [];
  const seen = new Set<string>();
  for (const block of html.match(/<article class="video-card[\s\S]*?<\/article>/g) || []) {
    const code = block.match(/href="https:\/\/[^/]+\/d\/(\w+)"/)?.[1];
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push([code, num(stat(block, "eye")), dur(stat(block, "clock")), num(stat(block, "heart"))]);
  }
  return out;
}

async function folderStats(url: URL): Promise<Response> {
  const f = url.searchParams.get("f") || "";
  const p = Number(url.searchParams.get("p") || "1");
  const origin = FOLDERS[f];
  if (!origin || !Number.isInteger(p) || p < 1 || p > 2000) return json({ ok: false, error: "bad_request" }, 400);
  const target = p === 1 ? `${origin}/f/${f}` : `${origin}/f/${f}/page/${p}`;
  try {
    const res = await fetch(target, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "id-ID,id;q=0.9,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
    if (res.status === 404) return json({ ok: true, status: 404, items: [] }, 200, "public, max-age=600");
    if (!res.ok) return json({ ok: false, status: res.status }, 502);
    const items = parseFolderPage(await res.text());
    return json({ ok: true, status: 200, items }, 200, "public, max-age=600");
  } catch {
    return json({ ok: false, status: 0 }, 502);
  }
}

async function siteLikesFeed(): Promise<Response> {
  try {
    const { siteLikes } = await import("../../src/lib/catalog/ranking-list");
    const likes = await siteLikes();
    return json({ ok: true, likes }, 200, "public, max-age=300");
  } catch {
    return json({ ok: false, error: "unavailable" }, 503);
  }
}

export default function statsFeedMiddleware(
  event: FeedEvent,
  next: () => unknown | Promise<unknown>,
): unknown | Promise<unknown> {
  const path = event.url.pathname;
  if (path !== "/api/folder-stats" && path !== "/api/site-likes") return next();
  if (event.req.method !== "GET" && event.req.method !== "HEAD") return json({ ok: false, error: "method" }, 405);
  return path === "/api/folder-stats" ? folderStats(event.url) : siteLikesFeed();
}
