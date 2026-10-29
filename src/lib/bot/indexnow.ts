/**
 * IndexNow ping (Bing, Yandex, Seznam, Naver; DuckDuckGo reads Bing's index), once per bot upload batch.
 *
 * New videos only exist on the site after the GitHub commit is built and deployed, so pinging a
 * batch's own URLs right away would send crawlers to a 404. Instead each batch:
 *   1. reads the ids queued by earlier batches (KV `seo:indexnow:pending`),
 *   2. submits the ones that are now live in this deployed catalog, plus their category pages and
 *      the homepage, in ONE POST,
 *   3. queues this batch's new ids (and anything not live yet) for the next batch.
 * So a batch's videos are announced on the next upload batch. Videos also stay in the sitemap,
 * which search engines read on their own; nothing here is required for them to be indexed.
 *
 * Cost: one KV read + one KV write + one outbound fetch per upload batch (not per visit), no timers.
 * Every failure is caught and only reported as a line in the bot's batch summary.
 */
import { SITE_ORIGIN } from "@/lib/seo";

/** Key file served from /public (already verified by Bing). Not a secret: IndexNow keys are public. */
export const INDEXNOW_KEY = "73356680884e9de90f845b0907eb4053";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const PENDING_KEY = "seo:indexnow:pending";
/** Pending ids older than this are dropped (sitemap still covers them). */
const PENDING_TTL_SEC = 14 * 24 * 3600;
const MAX_PENDING = 400;
/** Well under the IndexNow limit of 10,000 URLs per POST. */
const MAX_URLS = 500;

type Created = { id?: string | null; hidden?: boolean | null };
type Pending = { id: string; at: number };

export type IndexNowBuild = {
  urls: string[];
  /** Ids submitted now (live in this deploy). */
  submittedIds: string[];
  /** Ids to keep for the next batch. */
  pending: Pending[];
};

export function indexNowBody(urls: string[]) {
  return {
    host: new URL(SITE_ORIGIN).host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };
}

function parsePending(raw: string | null, now: number): Pending[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: Pending[] = [];
    for (const p of arr) {
      const id = typeof p?.id === "string" ? p.id : "";
      const at = Number(p?.at) || 0;
      if (id && /^[A-Za-z0-9_-]{3,64}$/.test(id) && now - at < PENDING_TTL_SEC * 1000) out.push({ id, at });
    }
    return out;
  } catch {
    return [];
  }
}

/** Pure part: decide which URLs to send and what stays queued. */
export function buildIndexNow(
  live: Map<string, { category?: string }>,
  pendingIn: Pending[],
  created: Created[],
  now: number,
): IndexNowBuild {
  const seen = new Set<string>();
  const queue: Pending[] = [];
  for (const p of pendingIn) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    queue.push(p);
  }
  for (const c of created) {
    const id = String(c?.id || "").trim();
    if (!id || c?.hidden || seen.has(id)) continue;
    seen.add(id);
    queue.push({ id, at: now });
  }
  const submittedIds: string[] = [];
  const pending: Pending[] = [];
  const cats = new Set<string>();
  for (const p of queue) {
    const hit = live.get(p.id);
    if (hit && submittedIds.length < MAX_URLS - 40) {
      submittedIds.push(p.id);
      if (hit.category) cats.add(hit.category);
    } else if (!hit) pending.push(p);
  }
  const urls: string[] = [];
  if (submittedIds.length) {
    urls.push(`${SITE_ORIGIN}/`);
    for (const c of cats) urls.push(`${SITE_ORIGIN}/kategori/${encodeURIComponent(c)}`);
    for (const id of submittedIds) urls.push(`${SITE_ORIGIN}/watch/${encodeURIComponent(id)}`);
  }
  return { urls: urls.slice(0, MAX_URLS), submittedIds, pending: pending.slice(-MAX_PENDING) };
}

/** One line for the bot's batch summary; never throws. */
export async function indexNowAfterBatch(created: Created[]): Promise<string> {
  try {
    const now = Date.now();
    const [{ listSitemapWatchEntries }, kv] = await Promise.all([
      import("@/lib/catalog/sitemap-entries"),
      import("@/lib/owner-analytics-shared"),
    ]);
    const live = new Map<string, { category?: string }>();
    for (const e of await listSitemapWatchEntries()) live.set(e.id, { category: e.category });
    const pendingIn = parsePending(await kv.optionalKvGet(PENDING_KEY), now);
    const plan = buildIndexNow(live, pendingIn, created, now);

    let status = "";
    if (plan.urls.length) {
      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(indexNowBody(plan.urls)),
      });
      status = String(res.status);
      // 200/202 = accepted. On anything else keep the ids queued so the next batch retries them.
      if (res.status !== 200 && res.status !== 202) {
        plan.pending = [...plan.submittedIds.map((id) => ({ id, at: now })), ...plan.pending].slice(-MAX_PENDING);
      }
    }
    if (pendingIn.length || plan.pending.length) {
      await kv.optionalKvPut(PENDING_KEY, JSON.stringify(plan.pending), PENDING_TTL_SEC);
    }
    const sent = plan.urls.length ? `${plan.urls.length} URL (${plan.submittedIds.length} video) → ${status}` : "0 URL";
    return `🔎 IndexNow: ${sent} · ${plan.pending.length} nunggu deploy`;
  } catch (err) {
    return `🔎 IndexNow gagal: ${err instanceof Error ? err.message : String(err)}`.slice(0, 220);
  }
}
