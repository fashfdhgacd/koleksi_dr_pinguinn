#!/usr/bin/env node
/**
 * IndexNow sync (Bing, Yandex, Seznam, Naver, Yep; DuckDuckGo and Ecosia read Bing's index).
 *
 * Reads the LIVE sitemap index (so every URL sent is already deployed), compares each
 * `<loc> <lastmod>` with data/indexnow-urls.txt, and POSTs only new, changed or removed URLs to
 * api.indexnow.org (max 10,000 per POST). Removed URLs (merged / redirected) are sent too so the
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
 */
import { readFile, writeFile } from "node:fs/promises";

const ORIGIN = "https://koleksidrpinguin.com";
const HOST = new URL(ORIGIN).host;
/** Same public key as src/lib/bot/indexnow.ts; the file public/<key>.txt is already live. */
const KEY = "73356680884e9de90f845b0907eb4053";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const STATE = new URL("../data/indexnow-urls.txt", import.meta.url);
const MAX_PER_POST = 10000;
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
async function liveUrls() {
  const index = blocks(await getText(`${ORIGIN}/sitemap.xml`), "sitemap");
  if (!index.length) throw new Error("sitemap index kosong");
  const map = new Map();
  for (const s of index) {
    const urls = blocks(await getText(s.loc), "url");
    if (!urls.length) throw new Error(`${s.loc} kosong`);
    for (const u of urls) {
      if (!u.loc.startsWith(`${ORIGIN}/`)) continue;
      map.set(u.loc.slice(ORIGIN.length), u.lastmod || "-");
    }
  }
  return map;
}

async function readState() {
  try {
    const map = new Map();
    for (const line of (await readFile(STATE, "utf8")).split("\n")) {
      const sp = line.lastIndexOf(" ");
      if (sp > 0 && line.startsWith("/")) map.set(line.slice(0, sp), line.slice(sp + 1));
    }
    return map;
  } catch {
    return null;
  }
}

async function submit(urls) {
  for (let i = 0; i < urls.length; i += MAX_PER_POST) {
    const urlList = urls.slice(i, i + MAX_PER_POST);
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${ORIGIN}/${KEY}.txt`, urlList }),
    });
    const body = (await r.text()).slice(0, 300);
    console.log(`IndexNow POST ${urlList.length} URL -> HTTP ${r.status} ${body}`);
    // 200 OK, 202 Accepted (key check pending). 400/403/422/429 = nothing accepted.
    if (r.status !== 200 && r.status !== 202) throw new Error(`IndexNow HTTP ${r.status}`);
  }
}

const live = await liveUrls();
const prev = await readState();
console.log(`sitemap live: ${live.size} URL; state: ${prev ? prev.size : "belum ada"}`);
if (prev && prev.size > 100 && live.size < prev.size * 0.5) {
  throw new Error(
    `sitemap live cuma ${live.size} URL (state ${prev.size}); dibatalkan, state tidak diubah`,
  );
}

let send;
if (ALL || !prev) {
  // First run without --all only records the state (the sitemap already covers old URLs).
  send = ALL ? [...live.keys()] : [];
  if (!prev && !ALL) console.log("state belum ada: dicatat saja, tidak ada yang dikirim");
} else {
  const changed = [...live].filter(([p, m]) => prev.get(p) !== m).map(([p]) => p);
  const removed = [...prev.keys()].filter((p) => !live.has(p)).slice(0, MAX_REMOVED);
  console.log(`baru/berubah: ${changed.length}; hilang dari sitemap: ${removed.length}`);
  send = [...changed, ...removed];
}
const urls = send.map((p) => ORIGIN + p);
if (DRY) {
  console.log(`[dry-run] akan dikirim ${urls.length} URL`, urls.slice(0, 10));
  process.exit(0);
}
if (urls.length) await submit(urls);
else console.log("tidak ada URL baru");

const lines = [...live]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([p, m]) => `${p} ${m}`);
await writeFile(STATE, lines.join("\n") + "\n");
console.log(`state ditulis: ${lines.length} baris`);
