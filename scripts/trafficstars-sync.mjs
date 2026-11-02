#!/usr/bin/env node
// Sinkron statistik publisher TrafficStars (14 hari UTC terakhir) ke public/data/trafficstars.json.
// Dipanggil oleh .github/workflows/trafficstars-sync.yml. Butuh secret TRAFFICSTARS_API_KEY
// (API key dari https://admin.trafficstars.com/profile/). File cuma ditulis kalau angka hariannya berubah.
// API: POST /v1/auth/token (grant_type=refresh_token, refresh_token=API key) -> access_token,
//      GET /v1.1/publisher/custom/report/by-day?date_from&date_to (docs.trafficstars.com/_reports.md).
import { readFile, writeFile } from "node:fs/promises";

const API = "https://api.trafficstars.com";
const FILE = process.env.TS_FILE || "public/data/trafficstars.json";
const DAYS = 14;

const key = (process.env.TRAFFICSTARS_API_KEY || "").trim();
if (!key) {
  console.error(
    "TRAFFICSTARS_API_KEY belum diisi. Tambahkan di GitHub: Settings > Secrets and variables > Actions > New repository secret " +
      "(nama: TRAFFICSTARS_API_KEY, isi: API key dari https://admin.trafficstars.com/profile/).",
  );
  process.exit(1);
}

const ymd = (d) => d.toISOString().slice(0, 10);

async function fetchJson(url, init, label) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    if (res.ok) {
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`${label}: respon bukan JSON: ${text.slice(0, 200)}`);
      }
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 5000));
      continue;
    }
    throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
}

const auth = await fetchJson(
  `${API}/v1/auth/token`,
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: key }),
  },
  "auth/token",
);
if (!auth?.access_token)
  throw new Error("auth/token: tidak ada access_token (API key salah/kedaluwarsa?)");

const now = new Date();
const to = ymd(now);
const from = ymd(new Date(now.getTime() - (DAYS - 1) * 86_400_000));
const report = await fetchJson(
  `${API}/v1.1/publisher/custom/report/by-day?${new URLSearchParams({ date_from: from, date_to: to })}`,
  { headers: { Authorization: `Bearer ${auth.access_token}`, Accept: "application/json" } },
  "publisher/custom/report/by-day",
);
const rows = Array.isArray(report?.response)
  ? report.response
  : Array.isArray(report)
    ? report
    : null;
if (!rows) throw new Error(`report: format tak dikenal: ${JSON.stringify(report).slice(0, 300)}`);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const byDate = new Map();
for (const r of rows) {
  const date = String(r.day ?? r.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < from || date > to) continue;
  const prev = byDate.get(date) ?? { impressions: 0, clicks: 0, earnings: 0 };
  prev.impressions += num(r.impressions);
  prev.clicks += num(r.clicks);
  prev.earnings += num(r.amount ?? r.earnings ?? r.revenue);
  byDate.set(date, prev);
}
const days = [...byDate.entries()]
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([date, v]) => ({
    date,
    impressions: Math.round(v.impressions),
    clicks: Math.round(v.clicks),
    earnings: Math.round(v.earnings * 100) / 100,
  }));

let old = null;
try {
  old = JSON.parse(await readFile(FILE, "utf8"));
} catch {}
// Per spot per hari (UTC): by-spot dengan date_from = date_to per hari (filter spot_id[] di by-day
// tidak dipakai API), jadi 14 panggilan. Disimpan di file yang sama sebagai "spotNames" + "spots"
// (field tambahan; "days" tetap formatnya, pembaca lama tidak terpengaruh).
const { names, spotDays } = await fetchSpots();
const spotNames = { ...(old?.spotNames || {}), ...names };
if (
  old &&
  JSON.stringify(old.days) === JSON.stringify(days) &&
  JSON.stringify(old.spots || null) === JSON.stringify(spotDays)
) {
  console.log(`Tidak ada perubahan (${from}..${to}, ${days.length} hari).`);
  process.exit(0);
}

const out = {
  updatedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  currency: old?.currency || "USD",
  source: old?.source || "TrafficStars publisher report (UTC days)",
  days,
};
// Format sama dengan file yang ada: satu hari per baris (juga untuk "spots").
const body =
  "{\n" +
  `  "updatedAt": ${JSON.stringify(out.updatedAt)},\n` +
  `  "currency": ${JSON.stringify(out.currency)},\n` +
  `  "source": ${JSON.stringify(out.source)},\n` +
  '  "days": [\n' +
  days
    .map(
      (d) =>
        `    { "date": ${JSON.stringify(d.date)}, "impressions": ${d.impressions}, "clicks": ${d.clicks}, "earnings": ${d.earnings} }`,
    )
    .join(",\n") +
  "\n  ],\n" +
  `  "spotNames": ${JSON.stringify(spotNames)},\n` +
  '  "spots": [\n' +
  spotDays.map((d) => `    ${JSON.stringify(d)}`).join(",\n") +
  "\n  ]\n}\n";
await writeFile(FILE, body);
const sum = days.reduce((s, d) => s + d.earnings, 0);
console.log(
  `Ditulis ${FILE}: ${from}..${to}, ${days.length} hari, ${Object.keys(names).length} spot, total $${sum.toFixed(2)}.`,
);

async function fetchSpots() {
  const names = {};
  const spotDays = [];
  for (const date of days.map((d) => d.date)) {
    const res = await fetchJson(
      `${API}/v1.1/publisher/custom/report/by-spot?${new URLSearchParams({ date_from: date, date_to: date })}`,
      { headers: { Authorization: `Bearer ${auth.access_token}`, Accept: "application/json" } },
      `publisher/custom/report/by-spot ${date}`,
    );
    const list = Array.isArray(res?.response) ? res.response : Array.isArray(res) ? res : null;
    if (!list)
      throw new Error(`by-spot ${date}: format tak dikenal: ${JSON.stringify(res).slice(0, 300)}`);
    const spots = [];
    for (const r of list) {
      const id = String(r.spot_id ?? "").trim();
      if (!id) continue;
      if (r.spot_name) names[id] = String(r.spot_name).replace(/^(koleksidrpinguin\.com\s+)+/i, "");
      const imp = Math.round(num(r.impressions));
      const clk = Math.round(num(r.clicks));
      const earn = Math.round(num(r.amount ?? r.earnings ?? r.revenue) * 100) / 100;
      if (imp || clk || earn) spots.push({ id, impressions: imp, clicks: clk, earnings: earn });
    }
    spots.sort((a, b) => b.impressions - a.impressions || a.id.localeCompare(b.id));
    spotDays.push({ date, spots });
  }
  return { names, spotDays };
}
