#!/usr/bin/env node
// Cek kesehatan situs harian (dipanggil .github/workflows/site-health.yml). Cuma GET publik:
// beranda, /kategori, sitemap (+ chunk watch + landing /cari baru), 10 /watch acak, beberapa /thumb,
// kartu share/OG (Twitterbot / facebookexternalhit / Googlebot) di beranda, kategori, cari, en,
// /watch, /v, /og/<id>.jpg, plus satelit videyy.icu & videqsss.icu. Exit 1 kalau ada masalah
// -> job gagal + GitHub email, dan satu Telegram alert lewat /api/owner-tools (token Worker yang
// sudah ada, tanpa env/KV baru).
import { BOT_UAS, ogImageOf, requiredSitemapPaths, shareImageProblem, sniffMagic } from "./lib/share-health-lib.mjs";

const BASE = (process.env.SITE_URL || "https://koleksidrpinguin.com").replace(/\/$/, "");
const MIN_WATCH = Number(process.env.MIN_WATCH_URLS || 9000);
const SAMPLE = Number(process.env.WATCH_SAMPLE || 10);
const THUMBS = 3;
// Satellite sites are standalone now (own Worker, own catalog): 200 with no redirect.
const SATELLITES = ["videqsss.icu", "videyy.icu"];
const UA = "koleksi-site-health/1.0 (+github-actions)";

const problems = [];
const lines = [];

async function get(url, { redirect = "follow", body = false } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect, headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
    const text = body ? await res.text() : (await res.arrayBuffer(), "");
    return { status: res.status, ms: Date.now() - t0, type: res.headers.get("content-type") || "", location: res.headers.get("location") || "", text };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, type: "", location: "", text: "", error: String(e?.message || e) };
  }
}

async function getUa(url, ua, { redirect = "follow", body = false, bytes = false } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect, headers: { "User-Agent": ua || UA }, signal: AbortSignal.timeout(30_000) });
    let text = "";
    let buf = new Uint8Array();
    if (bytes) {
      const ab = await res.arrayBuffer();
      buf = new Uint8Array(ab);
    } else if (body) {
      text = await res.text();
    } else {
      await res.arrayBuffer();
    }
    return { status: res.status, ms: Date.now() - t0, type: res.headers.get("content-type") || "", location: res.headers.get("location") || "", text, buf, error: "" };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, type: "", location: "", text: "", buf: new Uint8Array(), error: String(e?.message || e) };
  }
}

async function checkSharePage(pageUrl, origin, uaName) {
  const r = await getUa(pageUrl, BOT_UAS[uaName], { body: true });
  const path = (() => { try { return new URL(pageUrl).pathname; } catch { return pageUrl; } })();
  if (r.status !== 200 || r.error) {
    record(`${uaName} ${path}`, r, false, r.error || `HTTP ${r.status}`);
    return;
  }
  const og = ogImageOf(r.text);
  const imgUrl = og.og || og.twitter;
  let imageStatus = 0, imageType = "", imageBytes = 0, sniff = "";
  if (imgUrl) {
    const img = await getUa(imgUrl, BOT_UAS[uaName], { bytes: true });
    imageStatus = img.status;
    imageType = img.type;
    imageBytes = img.buf?.byteLength || 0;
    sniff = sniffMagic(img.buf);
  }
  const why = shareImageProblem({ pageUrl, origin, og, imageStatus, imageType, imageBytes, sniff });
  record(`${uaName} ${path}`, r, !why, why || r.error);
}

async function checkOgJpeg(origin, id, uaName) {
  const url = `${origin}/og/${encodeURIComponent(id)}.jpg`;
  const r = await getUa(url, BOT_UAS[uaName], { bytes: true });
  const sniff = sniffMagic(r.buf);
  const type = String(r.type || "").split(";")[0].trim().toLowerCase();
  const ok = r.status === 200 && sniff === "jpeg" && (!type || type === "image/jpeg" || type === "image/jpg") && r.buf.byteLength >= 32 && r.buf.byteLength <= 5 * 1024 * 1024;
  const why = ok ? "" : (r.error || `HTTP ${r.status} type=${type || "?"} sniff=${sniff} size=${r.buf.byteLength}`);
  record(`${uaName} /og/${id}.jpg`, r, ok, why);
}

function record(label, r, ok, why = "") {
  lines.push(`${ok ? "OK  " : "FAIL"} ${String(r.status).padStart(3)} ${String(r.ms).padStart(5)}ms ${label}${why ? ` — ${why}` : ""}`);
  if (!ok) problems.push(`${label}: ${why || `HTTP ${r.status}`}`);
}

const okPage = (r) => r.status >= 200 && r.status < 400;

for (const p of ["/", "/kategori"]) {
  const r = await get(BASE + p, { body: true });
  record(p, r, r.status === 200 && r.text.length > 1000, r.error || (r.status === 200 ? (r.text.length > 1000 ? "" : "halaman kosong") : `HTTP ${r.status}`));
}

// Sitemap: bisa sitemapindex (chunk) atau urlset langsung.
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
const sm = await get(`${BASE}/sitemap.xml`, { body: true });
record("/sitemap.xml", sm, sm.status === 200 && sm.text.includes("<loc>"), sm.error || (sm.status === 200 ? "" : `HTTP ${sm.status}`));
let watchUrls = [];
if (sm.status === 200) {
  if (sm.text.includes("<sitemapindex")) {
    for (const child of locs(sm.text)) {
      const c = await get(child, { body: true });
      const path = new URL(child).pathname;
      record(path, c, c.status === 200, c.error || (c.status === 200 ? "" : `HTTP ${c.status}`));
      if (c.status === 200) watchUrls.push(...locs(c.text).filter((u) => /\/watch\//.test(u)));
    }
  } else {
    watchUrls = locs(sm.text).filter((u) => /\/watch\//.test(u));
  }
}
watchUrls = [...new Set(watchUrls)];
const countOk = watchUrls.length >= MIN_WATCH;
lines.push(`${countOk ? "OK  " : "FAIL"} sitemap watch URLs: ${watchUrls.length} (batas bawah ${MIN_WATCH})`);
if (!countOk) problems.push(`sitemap cuma ${watchUrls.length} watch URL (< ${MIN_WATCH})`);

// 10 /watch acak + /thumb untuk sebagian id-nya.
const pick = [...watchUrls].sort(() => Math.random() - 0.5).slice(0, SAMPLE);
for (const [i, u] of pick.entries()) {
  const path = new URL(u).pathname;
  const r = await get(BASE + path, { body: true });
  const ok = r.status === 200 && r.text.length > 1000;
  record(path, r, ok, r.error || (r.status !== 200 ? `HTTP ${r.status}` : ok ? "" : "halaman kosong"));
  if (i < THUMBS) {
    const id = decodeURIComponent(path.split("/").filter(Boolean).pop() || "");
    const t = await get(`${BASE}/thumb/${encodeURIComponent(id)}`);
    record(`/thumb/${id}`, t, okPage(t) && t.status < 500, t.error || (okPage(t) ? "" : `HTTP ${t.status}`));
  }
}

for (const d of SATELLITES) {
  const r = await get(`https://${d}/`, { redirect: "manual" });
  const ok = r.status === 200;
  record(`https://${d}/`, r, ok, r.error || (ok ? "" : `harus 200 tanpa redirect, dapat ${r.status}${r.location ? ` -> ${r.location}` : ""}`));
}

// Dead-man check: /api/cron-status publik dan cuma berisi timestamp/status. Cron Worker jalan tiap
// jam; kalau `last.at` lebih tua dari 3 jam, pipeline cron/flush/upload kemungkinan mati -> FAIL,
// job gagal, GitHub email ke pemilik. Satu GET tambahan per run, tanpa secret atau KV write baru.
const cs = await get(`${BASE}/api/cron-status`, { body: true });
let cronOk = false;
let cronWhy = "";
try {
  const j = JSON.parse(cs.text);
  const last = JSON.parse(String(j.last || "{}"));
  const ageMs = last.at ? Date.now() - Date.parse(last.at) : Infinity;
  cronOk = cs.status === 200 && Number.isFinite(ageMs) && ageMs < 3 * 3600_000;
  cronWhy = cronOk ? "" : `cron terakhir ${last.at || "tidak ada"}`;
} catch {
  cronWhy = cs.error || `HTTP ${cs.status || "?"}`;
}
record("/api/cron-status (cron <=3 jam)", cs, cronOk, cronWhy);

// Landing /cari baru harus tetap ada di sitemap-pages.xml (bukan cuma homepage).
const pagesSm = await get(`${BASE}/sitemap-pages.xml`, { body: true });
record("/sitemap-pages.xml", pagesSm, pagesSm.status === 200 && pagesSm.text.includes("<loc>"), pagesSm.error || (pagesSm.status === 200 ? "" : `HTTP ${pagesSm.status}`));
if (pagesSm.status === 200) {
  for (const path of requiredSitemapPaths()) {
    const ok = pagesSm.text.includes(`${BASE}${path}`) || pagesSm.text.includes(path);
    lines.push(`${ok ? "OK  " : "FAIL"} sitemap-pages has ${path}`);
    if (!ok) problems.push(`sitemap-pages.xml tidak memuat ${path}`);
  }
}

// Kartu share / OG: crawler UAs must see a same-origin JPEG.
const SHARE_PAGES = [
  `${BASE}/`,
  `${BASE}/kategori/amatir`,
  `${BASE}/cari/bokep-indoav-terbaru`,
  `${BASE}/cari/bokep-userbokep-indo`,
  `${BASE}/en`,
  `${BASE}/watch/9yMfGMDRKJKo`,
  `${BASE}/v/9yMfGMDRKJKo`,
];
for (const u of SHARE_PAGES) await checkSharePage(u, BASE, "Twitterbot");
await checkSharePage(`${BASE}/watch/9yMfGMDRKJKo`, BASE, "facebookexternalhit");
await checkSharePage(`${BASE}/watch/9yMfGMDRKJKo`, BASE, "Googlebot");
await checkOgJpeg(BASE, "9yMfGMDRKJKo", "Twitterbot");

for (const d of SATELLITES) {
  const origin = `https://${d}`;
  await checkSharePage(`${origin}/`, origin, "Twitterbot");
  await checkSharePage(`${origin}/watch/9yMfGMDRKJKo`, origin, "Twitterbot");
  await checkOgJpeg(origin, "9yMfGMDRKJKo", "Twitterbot");
}

console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Site health\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
}
if (problems.length) {
  console.error(`\n${problems.length} masalah:\n- ${problems.join("\n- ")}`);
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (token) {
    try {
      const res = await fetch(`${BASE}/api/owner-tools`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "share-alert", lines: problems }),
        signal: AbortSignal.timeout(20000),
      });
      console.log("telegram alert:", res.status);
    } catch (err) {
      console.log("telegram alert failed:", err?.message || err);
    }
  }
  process.exit(1);
}
console.log("\nSemua sehat.");
