/**
 * "Statistik 14 hari" for /pemilik: pure helpers (no server imports), shared by the D1 reader
 * (stats14-d1.ts), the owner API and the panel. Tested in stats14.test.ts.
 *
 * Data model: one row per (WIB day, kind, key) in analytics_daily_breakdown, filled from the existing
 * analytics_events rows (no new per-visit writes). `views` = pageviews (sum of sample weights),
 * `uniq` = distinct visitors that day (weighted). Kinds:
 *   device  — mobile / desktop / tablet / bot / other
 *   src     — classified referrer (SOURCE_KEYS); "internal" = moving between pages of the site
 *   ref     — raw referrer host for the "other" source (top REF_PER_DAY per day)
 *   country — two-letter code ("" = unknown)
 *   browser — chrome / safari / ...
 *   path    — top PATHS_PER_DAY pages per day
 */

export const STATS14_DAYS = 14;
export const PATHS_PER_DAY = 150;
export const REF_PER_DAY = 20;
export const BREAKDOWN_KINDS = ["device", "src", "ref", "country", "browser", "path"] as const;
export type BreakdownKind = (typeof BREAKDOWN_KINDS)[number];

export const SOURCE_KEYS = [
  "google",
  "bing",
  "duckduckgo",
  "yahoo",
  "justpaste",
  "direct",
  "telegram",
  "other",
] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number] | "internal";

export const SOURCE_LABELS: Record<SourceKey, string> = {
  google: "Google",
  bing: "Bing",
  duckduckgo: "DuckDuckGo",
  yahoo: "Yahoo",
  justpaste: "JustPaste",
  direct: "Langsung (ketik alamat / bookmark)",
  telegram: "Telegram",
  other: "Lainnya",
  internal: "Pindah halaman di dalam situs",
};

/** Own domains: a pageview with one of these as referrer is navigation inside the site. */
const OWN_HOST = /(^|\.)koleksidrpinguin\.(com|site)\.?$/;

/** Classify a stored referrer (hostname from normalizeRef, or "(direct)"). */
export function classifySource(ref: string | null | undefined): SourceKey {
  const r = String(ref || "").trim().toLowerCase().replace(/\.$/, "");
  if (!r || r === "(direct)") return "direct";
  if (OWN_HOST.test(r)) return "internal";
  if (/(^|\.)google\.[a-z.]+$/.test(r) || r === "com.google.android.googlequicksearchbox" || r.startsWith("com.google.android")) return "google";
  if (/(^|\.)bing\.com$/.test(r)) return "bing";
  if (/(^|\.)duckduckgo\.com$/.test(r)) return "duckduckgo";
  if (/(^|\.)yahoo\.[a-z.]+$/.test(r)) return "yahoo";
  if (/(^|\.)justpaste\.(it|me)$/.test(r)) return "justpaste";
  if (r === "t.me" || /(^|\.)telegram\.(org|me)$/.test(r) || r.startsWith("org.telegram") || r === "web.telegram.org") return "telegram";
  return "other";
}

export type BreakdownRow = { day: string; kind: BreakdownKind; key: string; views: number; uniq: number };

/** One analytics_events aggregate row: dimensions + one visitor's weight and pageview count. */
export type DimVisitorRow = {
  device: string;
  ref: string;
  country: string;
  browser: string;
  visitor: string;
  /** Visitor weight (sample rate, 1 when not sampled). */
  vw: number;
  /** Pageviews of this visitor with these dimensions. */
  n: number;
};

/**
 * Fold per-visitor dimension rows into breakdown rows for one day: views per key, and distinct
 * visitors per key (a visitor seen with two browsers counts once per browser, once per source…).
 */
export function foldDayRows(day: string, rows: DimVisitorRow[]): BreakdownRow[] {
  const acc = new Map<string, { kind: BreakdownKind; key: string; views: number; vis: Map<string, number> }>();
  const add = (kind: BreakdownKind, key: string, r: DimVisitorRow) => {
    const id = `${kind}\u0000${key}`;
    let e = acc.get(id);
    if (!e) acc.set(id, (e = { kind, key, views: 0, vis: new Map() }));
    const w = Math.max(1, Number(r.vw) || 1);
    e.views += w * Math.max(0, Number(r.n) || 0);
    const v = r.visitor || "";
    e.vis.set(v, Math.max(e.vis.get(v) || 0, w));
  };
  for (const r of rows) {
    add("device", r.device || "other", r);
    const src = classifySource(r.ref);
    add("src", src, r);
    if (src === "other") add("ref", String(r.ref || "").toLowerCase().replace(/\.$/, "").slice(0, 80), r);
    add("country", (r.country || "").toUpperCase().slice(0, 2), r);
    add("browser", r.browser || "other", r);
  }
  const out: BreakdownRow[] = [];
  const refs: BreakdownRow[] = [];
  for (const e of acc.values()) {
    let uniq = 0;
    for (const w of e.vis.values()) uniq += w;
    const row = { day, kind: e.kind, key: e.key, views: e.views, uniq };
    (e.kind === "ref" ? refs : out).push(row);
  }
  refs.sort((a, b) => b.uniq - a.uniq || b.views - a.views);
  return out.concat(refs.slice(0, REF_PER_DAY));
}

/** WIB day keys ending at `today`, `days` long, oldest first. */
export function wibDayList(today: string, days: number): string[] {
  const t = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) =>
    new Date(t - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

export type DayTotal = { day: string; views: number; uniq: number };
export type Series = { key: string; label: string; perDay: number[]; total: number; prevTotal: number };
export type TopItem = { key: string; label: string; views: number; uniq: number };

export type Stats14 = {
  ok: true;
  today: string;
  days: string[];
  /** Visitors (distinct per day) and pageviews per day, oldest first. */
  visitors: DayTotal[];
  totals: { uniq: number; views: number; prevUniq: number; prevViews: number };
  devices: Series[];
  sources: Series[];
  /** Pageviews that came from moving inside the site (referrer = own domain), per day. */
  internalViews: number[];
  otherRefs: TopItem[];
  pages: TopItem[];
  countries: TopItem[];
  browsers: TopItem[];
  updatedAt: string;
};

const DEVICE_ORDER: { key: string; label: string }[] = [
  { key: "mobile", label: "HP" },
  { key: "desktop", label: "Desktop" },
  { key: "tablet", label: "Tablet" },
];

/** Sum `uniq` (or `views`) of rows of one kind+key over a set of days. */
function sumOf(rows: BreakdownRow[], kind: BreakdownKind, field: "uniq" | "views", days: Set<string>) {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.kind !== kind || !days.has(r.day)) continue;
    m.set(r.key, (m.get(r.key) || 0) + (Number(r[field]) || 0));
  }
  return m;
}

function series(
  rows: BreakdownRow[],
  kind: BreakdownKind,
  keys: { key: string; label: string }[],
  days: string[],
  prev: Set<string>,
  field: "uniq" | "views" = "uniq",
): Series[] {
  const idx = new Map(days.map((d, i) => [d, i]));
  const prevSum = sumOf(rows, kind, field, prev);
  return keys.map(({ key, label }) => {
    const perDay = days.map(() => 0);
    for (const r of rows) {
      if (r.kind !== kind || r.key !== key) continue;
      const i = idx.get(r.day);
      if (i !== undefined) perDay[i] += Number(r[field]) || 0;
    }
    return { key, label, perDay, total: perDay.reduce((a, b) => a + b, 0), prevTotal: prevSum.get(key) || 0 };
  });
}

function top(rows: BreakdownRow[], kind: BreakdownKind, days: Set<string>, limit: number, by: "uniq" | "views"): TopItem[] {
  const m = new Map<string, TopItem>();
  for (const r of rows) {
    if (r.kind !== kind || !days.has(r.day)) continue;
    const e = m.get(r.key) || { key: r.key, label: r.key, views: 0, uniq: 0 };
    e.views += Number(r.views) || 0;
    e.uniq += Number(r.uniq) || 0;
    m.set(r.key, e);
  }
  return [...m.values()].sort((a, b) => b[by] - a[by] || b.views - a.views).slice(0, limit);
}

/**
 * Build the panel payload from 28 days of breakdown rows (14 shown + 14 before, for "dibanding 14
 * hari sebelumnya") and the daily summary totals.
 */
export function buildStats14(
  today: string,
  rows: BreakdownRow[],
  dayTotals: DayTotal[],
  now = Date.now(),
): Stats14 {
  const all = wibDayList(today, STATS14_DAYS * 2);
  const prevDays = all.slice(0, STATS14_DAYS);
  const days = all.slice(STATS14_DAYS);
  const cur = new Set(days);
  const prev = new Set(prevDays);
  const tot = new Map(dayTotals.map((d) => [d.day, d]));
  const visitors = days.map((d) => ({ day: d, views: tot.get(d)?.views || 0, uniq: tot.get(d)?.uniq || 0 }));
  const sumT = (set: string[], f: "views" | "uniq") => set.reduce((s, d) => s + (tot.get(d)?.[f] || 0), 0);
  const devices = series(rows, "device", DEVICE_ORDER, days, prev);
  const sources = series(
    rows,
    "src",
    SOURCE_KEYS.map((k) => ({ key: k, label: SOURCE_LABELS[k] })),
    days,
    prev,
  );
  const internal = series(rows, "src", [{ key: "internal", label: SOURCE_LABELS.internal }], days, prev, "views")[0];
  return {
    ok: true,
    today,
    days,
    visitors,
    totals: {
      uniq: sumT(days, "uniq"),
      views: sumT(days, "views"),
      prevUniq: sumT(prevDays, "uniq"),
      prevViews: sumT(prevDays, "views"),
    },
    devices,
    sources,
    internalViews: internal.perDay,
    otherRefs: top(rows, "ref", cur, 10, "uniq"),
    pages: top(rows, "path", cur, 20, "views"),
    countries: top(rows, "country", cur, 10, "uniq"),
    browsers: top(rows, "browser", cur, 8, "uniq"),
    updatedAt: new Date(now).toISOString(),
  };
}

/** "naik 1.234" / "turun 1.234" / "sama" — plain words, no percentages (owner preference). */
export function changeWords(cur: number, prev: number, fmt: (n: number) => string): string {
  const d = Math.round(cur - prev);
  if (!prev && !cur) return "belum ada data";
  if (!prev) return "belum ada data 14 hari sebelumnya";
  if (d === 0) return "sama dengan 14 hari sebelumnya";
  return `${d > 0 ? "naik" : "turun"} ${fmt(Math.abs(d))} dari 14 hari sebelumnya (${fmt(prev)})`;
}
