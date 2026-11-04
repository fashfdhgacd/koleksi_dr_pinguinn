#!/usr/bin/env node
// Diagnosa runtuhnya DDG/Bing/direct (read-only D1) -> data/traffic-diagnose.json.
// Pertanyaan: runtuh mendadak per jam atau bertahap? Populasi mana (negara/perangkat/browser/referrer persis)?
// Pengunjung "mesin pencari" dan "direct" sebelum runtuh punya profil yang sama (satu populasi) atau berbeda?
import { writeFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SOURCE_CASE, D1_DATABASE_ID, wibDayStartMs } from "./traffic-monitor.mjs";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const chk = (d) => {
  if (!DAY.test(d)) throw new Error("hari tidak valid");
  return d;
};
const SRC = `('duckduckgo','bing','yahoo','direct','google','justpaste')`;

/** Visitor unik per jam WIB per sumber (first-touch per hari), 3 hari sekitar runtuhnya. */
export function hourlySql(fromDay, toDay) {
  const from = wibDayStartMs(chk(fromDay));
  const to = wibDayStartMs(chk(toDay)) + 86400000;
  return `with m as (select visitor_id, min(created_at) t, lower(coalesce(referrer,'')) r
 from analytics_events where created_at >= ${from} and created_at < ${to} and visitor_id is not null
 group by visitor_id, date((created_at+25200000)/1000,'unixepoch')),
f as (select date((t+25200000)/1000,'unixepoch') d, strftime('%H',(t+25200000)/1000,'unixepoch') h, r from m)
select d, h, ${SOURCE_CASE} src, count(*) v from f group by d, h, src having src in ${SRC} order by d, h, src`;
}

/** Profil populasi per sumber untuk satu jendela: dimensi = country | device_type | browser | host(referrer) | pv/visitor. */
export function profileSql(dim, fromDay, toDay) {
  if (!["country", "device_type", "browser", "refhost"].includes(dim)) throw new Error("dim tidak valid");
  const from = wibDayStartMs(chk(fromDay));
  const to = wibDayStartMs(chk(toDay)) + 86400000;
  const col =
    dim === "refhost"
      ? `substr(r,1,40)`
      : `coalesce(${dim},'?')`;
  return `with e as (select visitor_id, lower(coalesce(referrer,'')) r, country, device_type, browser, created_at
 from analytics_events where created_at >= ${from} and created_at < ${to} and visitor_id is not null),
f as (select visitor_id, min(created_at) t from e group by visitor_id),
x as (select e.visitor_id, e.r, e.country, e.device_type, e.browser from e join f on f.visitor_id=e.visitor_id and f.t=e.created_at)
select ${SOURCE_CASE} src, ${col} k, count(*) v from x group by src, k having src in ('duckduckgo','bing','direct') order by src, v desc limit 60`;
}

/** Halaman per pengunjung (pv/visitor) per sumber: bot-like kalau ~1 atau sangat tinggi dan seragam. */
export function depthSql(fromDay, toDay) {
  const from = wibDayStartMs(chk(fromDay));
  const to = wibDayStartMs(chk(toDay)) + 86400000;
  return `with e as (select visitor_id, date((created_at+25200000)/1000,'unixepoch') d, lower(coalesce(referrer,'')) r, created_at
 from analytics_events where created_at >= ${from} and created_at < ${to} and visitor_id is not null and event_type='pageview'),
g as (select visitor_id, d, count(*) pv, r, min(created_at) from e group by visitor_id, d)
select d, ${SOURCE_CASE} src, count(*) v, round(avg(pv),2) avg_pv, sum(case when pv=1 then 1 else 0 end) one_pv, max(pv) max_pv from g group by d, src having src in ${SRC} order by d, src`;
}

async function d1(sql, { token, accountId }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${D1_DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(`D1 HTTP ${res.status}: ${JSON.stringify(body.errors || body).slice(0, 300)}`);
  return body.result?.[0]?.results || [];
}

export async function main(env = process.env) {
  const token = (env.CLOUDFLARE_API_TOKEN || "").trim();
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  if (!token || !accountId) {
    console.log("::warning::Secret Cloudflare belum diisi; tidak ada query.");
    return;
  }
  const c = { token, accountId };
  const W = { before: ["2026-10-28", "2026-10-30"], after: ["2026-11-02", "2026-11-04"] };
  const out = { windows: W };
  out.hourly = await d1(hourlySql("2026-10-30", "2026-11-01"), c);
  out.depth = await d1(depthSql("2026-10-28", "2026-11-03"), c);
  out.profile = {};
  for (const dim of ["country", "device_type", "browser", "refhost"])
    for (const [k, [a, b]] of Object.entries(W)) out.profile[`${dim}:${k}`] = await d1(profileSql(dim, a, b), c);
  await writeFile("data/traffic-diagnose.json", JSON.stringify(out) + "\n");
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, "Selesai; lihat artifact traffic-diagnose.\n");
  console.log("ok");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
