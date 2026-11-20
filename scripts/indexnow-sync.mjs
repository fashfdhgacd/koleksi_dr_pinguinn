#!/usr/bin/env node
/**
 * IndexNow sync (Bing, Yandex, Seznam, Naver, Yep; DuckDuckGo and Ecosia read Bing's index).
 *
 * Reads the LIVE sitemap index (so every URL sent is already deployed), compares each
 * `<loc> <lastmod>` with data/indexnow-urls.txt, and POSTs only new, changed or removed URLs to
 * api.indexnow.org in small POSTs (100 URL each, max 500 per run, new /watch pages first). Removed URLs (merged / redirected) are sent too so the
 * engines recrawl them and pick up the 301. Then it rewrites the state file.
 *
 * Runs in GitHub Actions (.github/workflows/indexnow.yml): no Worker env, no KV, no Cloudflare cost
 * beyond a normal crawl of the sitemap (~12 requests per run).
 *
 *   node scripts/indexnow-sync.mjs            submit the diff, update state
 *   node scripts/indexnow-sync.mjs --all      submit every sitemap URL once, update state
 *   node scripts/indexnow-sync.mjs --dry-run  print what would be sent, change nothing
 *
 * Google does not use IndexNow; it reads the sitemap from robots.txt / Search Console.
 *
 * The same run also diffs videyy.icu and videqsss.icu (own keys, already live) and stores
 * their state as absolute URLs in the same file, so the existing IndexNow workflow — which
 * only `git add`s data/indexnow-urls.txt — keeps the satellites pinged even when the
 * private vidy repo's Actions cannot run.
 */
import { readFile, rename, writeFile } from "node:fs/promises";
import {
  formatIndexNowState,
  parseIndexNowOriginState,
  parseIndexNowState,
  planIndexNowSync,
  prioritizeIndexNow,
  seedIndexNowPaths,
} from "./lib/indexnow-sync-lib.mjs";

/** Public IndexNow keys (also served as /{key}.txt on each host). Not secrets. */
const SITES = [
  { origin: "https://koleksidrpinguin.com", key: "73356680884e9de90f845b0907eb4053", seedIfEmpty: false },
  { origin: "https://videyy.icu", key: "73356680884e9de90f845b0907eb4053", seedIfEmpty: true },
  { origin: "https://videqsss.icu", key: "34776cb0e75d82e12409aa3b3c9b5eea", seedIfEmpty: true },
];
const ENDPOINTS = ["https://api.indexnow.org/indexnow", "https://yandex.com/indexnow"];
const STATE = new URL("../data/indexnow-urls.txt", import.meta.url);
/**
 * Small submissions: Bing Webmaster flags big "batch mode" dumps. Each POST carries at most
 * MAX_PER_POST URLs with a pause between POSTs, and one run sends at most MAX_PER_RUN URLs;
 * the rest stay out of state so the next run (every 6 h / after the next upload) sends them.
 */
const MAX_PER_POST = 100;
const MAX_PER_RUN = 500;
const POST_GAP_MS = 3000;
/** Cap on removed URLs per run, so a broken sitemap can never flood the engines. */
const MAX_REMOVED = 2000;

const args = new Set(process.argv.slice(2));
const ALL = args.has("--all");
const DRY = args.has("--dry-run");

async function getText(url) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "koleksi-indexnow-sync/1.0" } });
      if (r.ok) return await r.text();
      console.warn(`${url} -> HTTP ${r.status}`);
    } catch (e) {
      console.warn(`${url} -> ${e.message}`);
    }
    await new Promise((res) => setTimeout(res, 2000 * i));
  }
  throw new Error(`gagal ambil ${url}`);
}

const unxml = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

/** [{loc, lastmod}] for each <tag> block (url or sitemap). */
function blocks(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  for (const m of xml.matchAll(re)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(m[1])?.[1];
    if (!loc) continue;
    const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(m[1])?.[1] || "";
    out.push({ loc: unxml(loc.trim()), lastmod: lastmod.trim() });
  }
  return out;
}

/** path -> lastmod, from the live sitemap index and all child sitemaps. */
async function liveUrls(origin) {
  const index = blocks(await getText(`${origin}/sitemap.xml`), "sitemap");
  if (!index.length) throw new Error(`${origin}/sitemap.xml index kosong`);
  const map = new Map();
  for (const s of index) {
    const urls = blocks(await getText(s.loc), "url");
    if (!urls.length) throw new Error(`${s.loc} kosong`);
    for (const u of urls) {
      if (!u.loc.startsWith(`${origin}/`)) continue;
      map.set(u.loc.slice(origin.length), u.lastmod || "-");
    }
  }
  return map;
}


async function submit(origin, key, urls) {
  const host = new URL(origin).host;
  for (let i = 0; i < urls.length; i += MAX_PER_POST) {
    if (i > 0) await new Promise((res) => setTimeout(res, POST_GAP_MS));
    const urlList = urls.slice(i, i + MAX_PER_POST);
    const payload = JSON.stringify({ host, key, keyLocation: `${origin}/${key}.txt`, urlList });
    for (const [n, endpoint] of ENDPOINTS.entries()) {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: payload,
      });
      const body = (await r.text()).slice(0, 300);
      console.log(`IndexNow ${host} ${new URL(endpoint).host} POST ${urlList.length} URL -> HTTP ${r.status} ${body}`);
      // Shared endpoint must accept (200/202). Yandex is the same body; a Yandex blip does not
      // fail the run because the shared endpoint already fans out, but we still call Yandex directly.
      if (n === 0 && r.status !== 200 && r.status !== 202) throw new Error(`IndexNow ${host} HTTP ${r.status}`);
      if (n > 0 && r.status !== 200 && r.status !== 202) console.warn(`Yandex IndexNow ${host} HTTP ${r.status}`);
    }
  }
}

async function planOne(site, contents) {
  const { origin, seedIfEmpty } = site;
  const live = await liveUrls(origin);
  const prev = origin.includes("koleksidrpinguin.com")
    ? parseIndexNowState(contents)
    : parseIndexNowOriginState(contents, origin);
  const prevOrNull = prev.size ? prev : null;
  console.log(`== ${origin} ==`);
  console.log(`sitemap live: ${live.size} URL; state: ${prevOrNull ? prev.size : "belum ada"}`);
  if (prevOrNull && prev.size > 100 && live.size < prev.size * 0.5) {
    throw new Error(
      `${origin} sitemap live cuma ${live.size} URL (state ${prev.size}); dibatalkan, state tidak diubah`,
    );
  }

  let sendPlan;
  if (!prevOrNull && !ALL && seedIfEmpty) {
    const send = seedIndexNowPaths(live, { max: MAX_PER_RUN });
    const next = new Map();
    for (const path of send) {
      if (live.has(path)) next.set(path, live.get(path));
    }
    sendPlan = { send, next };
    console.log(`state belum ada: seed ${send.length} URL (drip)`);
  } else if (!prevOrNull && !ALL) {
    sendPlan = { send: [], next: new Map(live) };
    console.log("state belum ada: dicatat saja, tidak ada yang dikirim");
  } else {
    sendPlan = planIndexNowSync(live, prevOrNull, { all: ALL, maxRemoved: MAX_REMOVED });
  }
  const { send, next } = sendPlan;
  if (prevOrNull && !ALL) {
    const removedCount = send.filter((path) => !live.has(path)).length;
    console.log(`baru/berubah: ${send.length - removedCount}; hilang dari sitemap: ${removedCount}`);
    if (next.size > live.size) console.log(`sisa URL hilang dalam antrean: ${next.size - live.size}`);
  }
  const ordered = prioritizeIndexNow([...new Set(send)], prevOrNull);
  const deferred = ordered.slice(MAX_PER_RUN);
  for (const path of deferred) {
    if (prevOrNull?.has(path)) next.set(path, prevOrNull.get(path));
    else next.delete(path);
  }
  if (deferred.length) console.log(`ditunda ke run berikutnya: ${deferred.length} URL`);
  const urls = ordered.slice(0, MAX_PER_RUN).map((p) => (p === "/sitemap.xml" ? `${origin}/sitemap.xml` : origin + p));
  if (!urls.includes(`${origin}/sitemap.xml`) && urls.length) urls.unshift(`${origin}/sitemap.xml`);
  return { origin, key: site.key, urls, next };
}

const contents = await readFile(STATE, "utf8").catch((e) => {
  if (e?.code === "ENOENT") return "";
  throw e;
});

const plans = [];
for (const site of SITES) {
  plans.push(await planOne(site, contents));
}

if (DRY) {
  for (const plan of plans) {
    console.log(`[dry-run] ${plan.origin} akan dikirim ${plan.urls.length} URL`, plan.urls.slice(0, 10));
  }
  process.exit(0);
}

for (const plan of plans) {
  if (plan.urls.length) await submit(plan.origin, plan.key, plan.urls);
  else console.log(`${plan.origin}: tidak ada URL baru`);
}

const parts = [];
const kdp = plans[0];
if (kdp?.next) parts.push(formatIndexNowState(kdp.next));
for (const plan of plans.slice(1)) {
  if (plan.next?.size) parts.push(formatIndexNowState(plan.next, plan.origin));
}
const lines = parts.filter(Boolean).join("\n");
const tempState = new URL(`../data/indexnow-urls.txt.${process.pid}.tmp`, import.meta.url);
await writeFile(tempState, (lines ? lines + "\n" : ""));
await rename(tempState, STATE);
console.log(`state ditulis: ${lines ? lines.split("\n").filter(Boolean).length : 0} baris`);
