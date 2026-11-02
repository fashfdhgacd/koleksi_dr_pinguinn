#!/usr/bin/env node
// Cek kesehatan situs harian (dipanggil .github/workflows/site-health.yml). Cuma GET publik,
// ~20 request per run: beranda, /kategori, sitemap (+ chunk watch), 10 /watch acak, beberapa /thumb,
// dan domain redirect harus 301. Exit 1 kalau ada masalah -> job gagal -> GitHub email ke pemilik.
const BASE = (process.env.SITE_URL || "https://koleksidrpinguin.com").replace(/\/$/, "");
const MIN_WATCH = Number(process.env.MIN_WATCH_URLS || 9000);
const SAMPLE = Number(process.env.WATCH_SAMPLE || 10);
const THUMBS = 3;
const REDIRECTS = ["videqsss.icu", "videyy.icu"];
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

for (const d of REDIRECTS) {
  const r = await get(`https://${d}/`, { redirect: "manual" });
  const ok = r.status === 301 && /koleksidrpinguin\.com/.test(r.location);
  record(`https://${d}/ -> ${r.location || "-"}`, r, ok, r.error || (ok ? "" : `harus 301 ke koleksidrpinguin.com, dapat ${r.status}`));
}

console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Site health\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
}
if (problems.length) {
  console.error(`\n${problems.length} masalah:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nSemua sehat.");
