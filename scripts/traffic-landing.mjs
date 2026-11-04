#!/usr/bin/env node
// Laporan halaman masuk (landing) per sumber, HANYA baca D1 -> data/traffic-landing.json.
// Membandingkan dua jendela hari WIB (default: 23-30 Okt vs 1-4 Nov) untuk menemukan halaman mana yang
// kehilangan pengunjung dari DuckDuckGo/Bing/Yahoo/direct. Angka = visitor_id unik (bukan request bot).
import { writeFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SOURCE_CASE, D1_DATABASE_ID, wibDayStartMs } from "./traffic-monitor.mjs";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Landing pertama tiap visitor per hari WIB: path (tanpa query) + sumber. */
export function landingSql(fromDay, toDay) {
  if (!DAY.test(fromDay) || !DAY.test(toDay)) throw new Error("hari tidak valid");
  const from = wibDayStartMs(fromDay);
  const to = wibDayStartMs(toDay) + 86400000;
  return `with e as (select visitor_id, date((created_at+25200000)/1000,'unixepoch') d, lower(coalesce(referrer,'')) r,
 case when instr(coalesce(path,''),'?')>0 then substr(path,1,instr(path,'?')-1) else coalesce(path,'') end p, created_at t
 from analytics_events where created_at >= ${from} and created_at < ${to} and visitor_id is not null and event_type='pageview'),
f as (select visitor_id, d, r, p, row_number() over (partition by visitor_id, d order by t) n from e)
select ${SOURCE_CASE} src, p path, count(*) v, count(distinct d) days from f where n=1 group by src, p order by v desc limit 400`;
}

export function compare(before, after, days) {
  const map = new Map();
  for (const r of before) map.set(`${r.src}|${r.path}`, { src: r.src, path: r.path, before: Number(r.v) / days.before, after: 0 });
  for (const r of after) {
    const k = `${r.src}|${r.path}`;
    const o = map.get(k) || { src: r.src, path: r.path, before: 0, after: 0 };
    o.after = Number(r.v) / days.after;
    map.set(k, o);
  }
  return [...map.values()]
    .map((o) => ({ ...o, before: Math.round(o.before), after: Math.round(o.after), lost: Math.round(o.before - o.after) }))
    .sort((a, b) => b.lost - a.lost);
}

async function d1(sql, { token, accountId }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${D1_DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(`D1 HTTP ${res.status}: ${JSON.stringify(body.errors || body).slice(0, 300)}`);
  return body.result?.[0]?.results || [];
}

const span = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

export async function main(env = process.env) {
  const token = (env.CLOUDFLARE_API_TOKEN || "").trim();
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  if (!token || !accountId) {
    console.log("::warning::Secret Cloudflare belum diisi; tidak ada query.");
    return;
  }
  const w = {
    b1: env.BEFORE_FROM || "2026-10-23",
    b2: env.BEFORE_TO || "2026-10-30",
    a1: env.AFTER_FROM || "2026-11-01",
    a2: env.AFTER_TO || "2026-11-04",
  };
  const creds = { token, accountId };
  const before = await d1(landingSql(w.b1, w.b2), creds);
  const after = await d1(landingSql(w.a1, w.a2), creds);
  const rows = compare(before, after, { before: span(w.b1, w.b2), after: span(w.a1, w.a2) });
  const search = rows.filter((r) => ["duckduckgo", "bing", "yahoo"].includes(r.src));
  const out = {
    windows: w,
    note: "rata-rata visitor unik per hari; lost = before - after",
    topLostSearch: search.slice(0, 40),
    topLostDirect: rows.filter((r) => r.src === "direct").slice(0, 15),
    topNowAny: [...rows].sort((a, b) => b.after - a.after).slice(0, 40),
  };
  await writeFile("data/traffic-landing.json", JSON.stringify(out, null, 2) + "\n");
  const text = JSON.stringify(out, null, 1);
  console.log(text);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, "```json\n" + text + "\n```\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
