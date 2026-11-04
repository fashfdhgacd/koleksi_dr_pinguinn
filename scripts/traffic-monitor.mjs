#!/usr/bin/env node
// Monitor pengunjung harian per sumber -> data/traffic-daily.json (dipanggil .github/workflows/traffic-monitor.yml).
//
// Sumber data: D1 `koleksi-analytics` (tabel analytics_events + analytics_daily_summary) lewat Cloudflare REST API,
// HANYA baca (SELECT). Tidak menambah env var Worker, tidak menulis ke KV/D1, tidak menambah request ke situs.
// Butuh 2 secret GitHub (opsional): CLOUDFLARE_API_TOKEN (izin "D1 Read" saja) dan CLOUDFLARE_ACCOUNT_ID.
// Kalau secret belum ada: tidak query apa pun, cuma cek file yang ada + cetak ringkasan & peringatan (exit 0).
//
// Definisi (semua ANGKA AKTUAL dari D1, bukan request Cloudflare):
//   sources[src]  = jumlah visitor_id unik per hari WIB, dikelompokkan menurut referrer KUNJUNGAN PERTAMA hari itu.
//   unique_visitors / pageviews = analytics_daily_summary (pageviews = event view tercatat).
//   new / returning = visitor yang hari pertamanya = hari itu vs visitor yang sudah pernah datang sebelumnya
//                     (dihitung sejak data mulai tercatat 2026-10-05 11:03 WIB; jendela 35 hari ke belakang).
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const FILE = process.env.TRAFFIC_FILE || "data/traffic-daily.json";
export const D1_DATABASE_ID = "97453aca-c414-4251-92db-a7fb6d8d3b54"; // koleksi-analytics (wrangler.toml)
const WIB_MS = 7 * 3600 * 1000;
const DAY_MS = 86400 * 1000;
export const DROP_ALERT = 0.4; // peringatan kalau hari kemarin < 60% rata-rata 7 hari sebelumnya

export const SOURCE_CASE = `case when r='' or r like '(direct)%' then 'direct'
 when r like '%koleksidrpinguin.com%' then 'internal'
 when r like '%google%' then 'google' when r like '%duckduckgo%' then 'duckduckgo' when r like '%bing.com%' then 'bing'
 when r like '%yahoo%' then 'yahoo' when r like '%justpaste%' then 'justpaste' when r like '%brave%' then 'brave'
 when r like '%yandex%' or r like 'ya.ru%' then 'yandex'
 when r like 't.co%' or r like '%x.com%' or r like '%twitter%' then 'x'
 when r like '%t.me%' or r like '%telegram%' then 'telegram'
 when r like '%reddit%' then 'reddit' when r like '%bsky%' then 'bluesky' when r like '%discord%' then 'discord'
 when r like '%namevids%' or r like '%wvids%' or r like '%alohafind%' or r like '%myvidster%' or r like '%wape%' then 'tube_ref'
 else 'other' end`;

export const wibDay = (ms) => new Date(ms + WIB_MS).toISOString().slice(0, 10);
export const wibDayStartMs = (day) => Date.parse(`${day}T00:00:00Z`) - WIB_MS;

export function sourceSql(fromMs) {
  const from = Math.floor(Number(fromMs));
  if (!Number.isFinite(from)) throw new Error("fromMs tidak valid");
  return `with f as (select visitor_id, date((created_at+25200000)/1000,'unixepoch') d, lower(coalesce(referrer,'')) r, min(created_at) t
 from analytics_events where created_at >= ${from} and visitor_id is not null group by visitor_id, d)
select d, ${SOURCE_CASE} src, count(*) v from f group by d, src order by d, src`;
}

/** Visitor first-touch per hari/sumber yang negaranya Indonesia (ID). Memisahkan trafik yang masuk akal untuk situs berbahasa Indonesia. */
export function idSourceSql(fromMs) {
  const from = Math.floor(Number(fromMs));
  if (!Number.isFinite(from)) throw new Error("fromMs tidak valid");
  return `with f as (select visitor_id, date((created_at+25200000)/1000,'unixepoch') d, lower(coalesce(referrer,'')) r, coalesce(country,'') c, min(created_at) t
 from analytics_events where created_at >= ${from} and visitor_id is not null group by visitor_id, d)
select d, ${SOURCE_CASE} src, count(*) v from f where c='ID' group by d, src order by d, src`;
}

export function summarySql(fromDay) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay)) throw new Error("fromDay tidak valid");
  return `select day_wib d, views, unique_visitors from analytics_daily_summary where day_wib >= '${fromDay}' order by day_wib`;
}

export function newReturningSql(fromMs) {
  const from = Math.floor(Number(fromMs));
  const lookback = from - 35 * DAY_MS;
  return `with fs as (select visitor_id, min(created_at) f from analytics_events where created_at >= ${lookback} and visitor_id is not null group by visitor_id),
dv as (select distinct visitor_id, date((created_at+25200000)/1000,'unixepoch') d from analytics_events where created_at >= ${from} and visitor_id is not null)
select dv.d, sum(case when date((fs.f+25200000)/1000,'unixepoch')=dv.d then 1 else 0 end) new_v,
 sum(case when date((fs.f+25200000)/1000,'unixepoch')<dv.d then 1 else 0 end) ret_v
from dv join fs on fs.visitor_id=dv.visitor_id group by dv.d order by dv.d`;
}

/** Gabungkan hasil query ke peta hari. Hari yang dihitung ulang ditimpa utuh; hari lain tidak disentuh. */
export function mergeDays(existing, { sources = [], summary = [], newReturning = [], idSources = [] }, todayWib) {
  const days = { ...(existing || {}) };
  const touched = new Set([
    ...sources.map((r) => r.d),
    ...summary.map((r) => r.d),
    ...newReturning.map((r) => r.d),
  ]);
  for (const d of touched) days[d] = { sources: {} };
  for (const r of sources) days[r.d].sources[r.src] = Number(r.v) || 0;
  for (const r of idSources) {
    if (!days[r.d]) continue;
    (days[r.d].sources_id ||= {})[r.src] = Number(r.v) || 0;
  }
  for (const r of summary)
    Object.assign(days[r.d], {
      unique_visitors: Number(r.unique_visitors) || 0,
      pageviews: Number(r.views) || 0,
    });
  for (const r of newReturning)
    Object.assign(days[r.d], { new: Number(r.new_v) || 0, returning: Number(r.ret_v) || 0 });
  for (const d of touched) {
    const s = days[d].sources;
    days[d].landing_visitors = Object.values(s).reduce((a, b) => a + b, 0);
    if (d === todayWib) days[d].partial = true;
  }
  return Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)));
}

const EXTERNAL = (s) =>
  Object.entries(s || {})
    .filter(([k]) => k !== "internal")
    .reduce((a, [, v]) => a + v, 0);

/** Bandingkan hari lengkap terakhir dengan rata-rata 7 hari lengkap sebelumnya (visitor eksternal = tanpa 'internal'). */
export function detectDrop(days, todayWib) {
  const complete = Object.keys(days)
    .filter((d) => d < todayWib && !days[d].partial)
    .sort();
  if (complete.length < 8) return null;
  const last = complete.at(-1);
  const prev = complete.slice(-8, -1);
  const lastV = EXTERNAL(days[last].sources);
  const avg = prev.reduce((a, d) => a + EXTERNAL(days[d].sources), 0) / prev.length;
  const change = avg ? lastV / avg - 1 : 0;
  const perSource = {};
  for (const src of new Set([
    ...Object.keys(days[last].sources),
    ...prev.flatMap((d) => Object.keys(days[d].sources)),
  ])) {
    if (src === "internal") continue;
    const a = prev.reduce((x, d) => x + (days[d].sources[src] || 0), 0) / prev.length;
    perSource[src] = { last: days[last].sources[src] || 0, avg7: Math.round(a) };
  }
  return {
    day: last,
    external: lastV,
    avg7: Math.round(avg),
    change,
    alert: change <= -DROP_ALERT,
    perSource,
  };
}

async function d1(sql, { token, accountId }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${D1_DATABASE_ID}/query`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.success) return body.result?.[0]?.results || [];
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 5000));
      continue;
    }
    throw new Error(`D1 HTTP ${res.status}: ${JSON.stringify(body.errors || body).slice(0, 300)}`);
  }
}

function report(days, drop) {
  const lines = [];
  const recent = Object.keys(days).sort().slice(-8);
  lines.push("hari WIB    | unik  | landing | new  | ret | top sumber (visitor first-touch)");
  for (const d of recent) {
    const x = days[d];
    const top = Object.entries(x.sources || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    lines.push(
      `${d}${x.partial ? "*" : " "} | ${String(x.unique_visitors ?? "-").padStart(5)} | ${String(x.landing_visitors ?? "-").padStart(7)} | ${String(x.new ?? "-").padStart(4)} | ${String(x.returning ?? "-").padStart(3)} | ${top}`,
    );
  }
  lines.push("(* = hari berjalan, belum lengkap)");
  if (drop) {
    lines.push(
      `Hari lengkap terakhir ${drop.day}: visitor eksternal ${drop.external} vs rata-rata 7 hari ${drop.avg7} (${(drop.change * 100).toFixed(1)}%).`,
    );
    const moves = Object.entries(drop.perSource)
      .filter(([, v]) => v.avg7 >= 20 || v.last >= 20)
      .sort((a, b) => a[1].last - a[1].avg7 - (b[1].last - b[1].avg7));
    lines.push(
      "Per sumber (kemarin vs avg7): " +
        moves.map(([k, v]) => `${k} ${v.last}/${v.avg7}`).join(", "),
    );
  }
  return lines.join("\n");
}

export async function main(env = process.env, now = Date.now()) {
  const today = wibDay(now);
  let doc = { days: {} };
  try {
    doc = JSON.parse(await readFile(FILE, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const token = (env.CLOUDFLARE_API_TOKEN || "").trim();
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  let mode = "file-only";
  if (token && accountId) {
    // Hitung ulang 3 hari WIB terakhir (kemarin lusa, kemarin, hari ini) supaya hari parsial ikut lengkap.
    const fromDay = wibDay(now - 2 * DAY_MS);
    const fromMs = wibDayStartMs(fromDay);
    const creds = { token, accountId };
    const [sources, summary, newReturning, idSources] = [
      await d1(sourceSql(fromMs), creds),
      await d1(summarySql(fromDay), creds),
      await d1(newReturningSql(fromMs), creds),
      await d1(idSourceSql(fromMs), creds),
    ];
    const merged = mergeDays(doc.days, { sources, summary, newReturning, idSources }, today);
    const next = { ...doc, days: merged };
    if (JSON.stringify(next.days) !== JSON.stringify(doc.days)) {
      next.updatedAt = new Date(now).toISOString().replace(/\.\d+Z$/, "Z");
      await writeFile(FILE, JSON.stringify(next, null, 2) + "\n");
      console.log(`Ditulis: ${FILE} (hari ${fromDay}..${today})`);
    } else console.log("Tidak ada perubahan angka.");
    doc = next;
    mode = "d1";
  } else {
    console.log(
      "::warning::CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID belum diisi di GitHub Secrets -> D1 tidak dibaca, file tidak diubah. " +
        "Buat API token Cloudflare dengan izin Account > D1 > Read saja, lalu simpan di Settings > Secrets and variables > Actions.",
    );
  }
  const drop = detectDrop(doc.days, today);
  const text = report(doc.days, drop);
  console.log(`mode=${mode}\n${text}`);
  if (drop?.alert)
    console.log(
      `::warning::Visitor eksternal ${drop.day} turun ${(drop.change * 100).toFixed(1)}% vs rata-rata 7 hari.`,
    );
  if (env.GITHUB_STEP_SUMMARY)
    await appendFile(
      env.GITHUB_STEP_SUMMARY,
      "## Traffic monitor (" + mode + ")\n```\n" + text + "\n```\n",
    );
  if (env.GITHUB_OUTPUT)
    await appendFile(env.GITHUB_OUTPUT, `alert=${drop?.alert ? "true" : "false"}\nmode=${mode}\n`);
  return { mode, drop };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
