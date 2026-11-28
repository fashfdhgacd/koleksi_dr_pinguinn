/**
 * "Statistik 14 hari" for /pemilik: pure helpers (no server imports), shared by the D1 reader
 * (stats14-d1.ts), the owner API and the panel. Tested in stats14.test.ts.
 *
 * Data model: one row per (WIB day, kind, key) in analytics_daily_breakdown, filled from the existing
 * analytics_events rows (no new per-visit writes). `views` = pageviews (sum of sample weights),
 * `uniq` = distinct visitors that day (weighted). Kinds:
 *   device  — mobile / desktop / tablet / bot / other
 *   src     — classified referrer (SOURCE_KEYS); "internal" = moving between pages of the site
 *   ref     — raw external referrer host (top REF_PER_DAY per day; days folded before Nov 2026 only
 *             kept hosts of the "other" source — refPeriods fills named sources from "src")
 *   country — two-letter code ("" = unknown)
 *   browser — chrome / safari / ...
 *   path    — top PATHS_PER_DAY pages per day
 *   utm     — landing campaign "source|medium|campaign|content" (utm.ts), top UTM_PER_DAY per day;
 *             views = landings with that tag, uniq = distinct visitors who landed with it
 */
import { normalizeUtmKey, utmLabel } from "./utm.ts";

export const STATS14_DAYS = 14;
export const PATHS_PER_DAY = 150;
export const REF_PER_DAY = 40;
export const UTM_PER_DAY = 50;
export const BREAKDOWN_KINDS = ["device", "src", "ref", "country", "browser", "path", "utm"] as const;
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
    if (src !== "direct" && src !== "internal") add("ref", String(r.ref || "").toLowerCase().replace(/\.$/, "").slice(0, 80), r);
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

/** One landing-with-UTM aggregate row: utm key + one visitor's weight and landing count. */
export type UtmVisitorRow = { utm: string; visitor: string; vw: number; n: number };

/** Fold landing UTM rows into "utm" breakdown rows for one day (top UTM_PER_DAY by visitors). */
export function foldUtmRows(day: string, rows: UtmVisitorRow[]): BreakdownRow[] {
  const acc = new Map<string, { views: number; vis: Map<string, number> }>();
  for (const r of rows) {
    const key = normalizeUtmKey(r.utm);
    if (!key) continue;
    let e = acc.get(key);
    if (!e) acc.set(key, (e = { views: 0, vis: new Map() }));
    const w = Math.max(1, Number(r.vw) || 1);
    e.views += w * Math.max(0, Number(r.n) || 0);
    const v = r.visitor || "";
    e.vis.set(v, Math.max(e.vis.get(v) || 0, w));
  }
  const out: BreakdownRow[] = [];
  for (const [key, e] of acc) {
    let uniq = 0;
    for (const w of e.vis.values()) uniq += w;
    out.push({ day, kind: "utm", key, views: e.views, uniq });
  }
  out.sort((a, b) => b.uniq - a.uniq || b.views - a.views);
  return out.slice(0, UTM_PER_DAY);
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
  /** "Kampanye (UTM)": landings per utm key (label = readable form), most visitors first. */
  campaigns: TopItem[];
  /** "Sumber" card: per period (hari ini / kemarin / 7 / 14 hari) every source host + groups. */
  refPeriods: RefPeriod[];
  updatedAt: string;
};

export type RefGroupKey = "search" | "social" | "paste" | "direct" | "other";
export const REF_GROUP_LABELS: Record<RefGroupKey, string> = {
  search: "Pencarian",
  social: "Sosial",
  paste: "Tempel / link",
  direct: "Langsung",
  other: "Lainnya",
};
export type RefSource = { key: string; group: RefGroupKey; views: number; prev: number };
export type RefPeriod = {
  key: "today" | "yesterday" | "7d" | "14d";
  label: string;
  prevLabel: string;
  /** External sources (incl. "(direct)"), most views first. */
  sources: RefSource[];
  groups: { key: RefGroupKey; label: string; views: number; prev: number }[];
  /** Pageviews from moving between pages of the site (referrer = own domain). */
  internal: { views: number; prev: number };
  campaigns: (TopItem & { prev: number })[];
  /**
   * "Jumlah orang": distinct visitors and pageviews in the period and the period before. Hari ini /
   * kemarin = distinct visitors that WIB day; 7/14 hari = distinct visitors over the whole period when
   * `exact` (one owner-only query), else the per-day numbers added up (a returning visitor counts once
   * per day).
   */
  people: { uniq: number; views: number; prevUniq: number; prevViews: number; exact: boolean };
  /** "Asal pengunjung": every country (two-letter code, "" = unknown), most people first. */
  countries: { key: string; uniq: number; views: number; prevUniq: number }[];
  /**
   * Popunder tabs opened (player-log pop_n1..n6, TrafficStars or the ExoClick fallback), Videy vs other
   * hosts, plus how many of them the ExoClick fallback opened (pop_x1..x6; the rest, including all rows
   * from before the fallback existed, are TrafficStars), how many taps failed with both brands
   * (pop_f1/f2), first entitled play taps (tap_e) and first play taps on a video already at its cap
   * (tap_r); null when not read.
   */
  pops: { videy: number; other: number; prevVidey: number; prevOther: number; exo: number; prevExo: number; fail: number; prevFail: number; tap: number; prevTap: number; revisit: number; prevRevisit: number } | null;
};

/** Distinct visitors over a multi-day period (and the one before), from one aggregate read. */
export type PeriodDistinct = Partial<Record<RefPeriod["key"], { cur: number; prev: number }>>;
/**
 * One player_errors aggregate for a WIB day and host: `n` = popunder tabs opened (any brand), `exo` = of
 * those, opened by the ExoClick fallback, `fail` = taps where neither brand opened, `tap` = first
 * entitled play taps (tap_e), `revisit` = first play taps on a video already at its cap (tap_r).
 */
export type PopDayRow = { day: string; host: string; n: number; exo?: number; fail?: number; tap?: number; revisit?: number };
/** Extra (optional) inputs for the per-period cards. */
export type RefExtras = { dayTotals?: DayTotal[]; distinct?: PeriodDistinct; pops?: PopDayRow[] | null };

/** Group a referrer host into Pencarian / Sosial / Tempel / Langsung / Lainnya. */
export function refGroup(host: string): RefGroupKey {
  const r = String(host || "").trim().toLowerCase().replace(/\.$/, "");
  if (!r || r === "(direct)") return "direct";
  const src = classifySource(r);
  if (src === "google" || src === "bing" || src === "duckduckgo" || src === "yahoo") return "search";
  if (src === "justpaste") return "paste";
  if (src === "telegram") return "social";
  if (/(^|\.)(yandex|ecosia|baidu|naver|startpage|qwant|seznam|sogou|so|mojeek|presearch|petalsearch|ask|aol|you)\.[a-z.]+$/.test(r)) return "search";
  if (/(^|\.)search\.brave\.com$/.test(r) || /(^|\.)brave\.com$/.test(r) || r.startsWith("search.")) return "search";
  if (/^(t\.co|x\.com|twitter\.com|bsky\.app|threads\.net|lnkd\.in|fb\.me|wa\.me)$/.test(r)) return "social";
  if (/(^|\.)(facebook|instagram|reddit|tiktok|whatsapp|discord|discordapp|linkedin|youtube|pinterest|tumblr|vk|line|quora|mastodon|kaskus|bsky)\.[a-z.]+$/.test(r)) return "social";
  if (r.startsWith("com.facebook") || r.startsWith("com.twitter") || r.startsWith("com.instagram") || r.startsWith("com.whatsapp") || r.startsWith("com.reddit") || r.startsWith("com.zhiliaoapp") || r.startsWith("xyz.blueskyweb")) return "social";
  if (/(^|\.)(pastebin\.com|telegra\.ph|rentry\.(co|org)|controlc\.com|paste\.ee|ghostbin\.[a-z]+|privatebin\.[a-z.]+|linktr\.ee|bit\.ly|s\.id|tinyurl\.com|cutt\.ly|linkr\.bio|bio\.link|carrd\.co|notion\.site|blogspot\.com|wordpress\.com|medium\.com)$/.test(r)) return "paste";
  return "other";
}

/** Host shown for a named source on days that stored only its "src" total (canonical host). */
const SRC_HOST: Partial<Record<SourceKey, string>> = {
  google: "google.com",
  bing: "bing.com",
  duckduckgo: "duckduckgo.com",
  yahoo: "yahoo.com",
  justpaste: "justpaste.it",
  telegram: "t.me",
  direct: "(direct)",
};

/** Pageviews per external source host for one day: "ref" rows, topped up from "src" totals. */
function dayHosts(rows: BreakdownRow[]): Map<string, number> {
  const hosts = new Map<string, number>();
  const covered = new Map<string, number>();
  for (const r of rows) {
    if (r.kind !== "ref") continue;
    hosts.set(r.key, (hosts.get(r.key) || 0) + (Number(r.views) || 0));
    const src = classifySource(r.key);
    covered.set(src, (covered.get(src) || 0) + (Number(r.views) || 0));
  }
  for (const r of rows) {
    if (r.kind !== "src") continue;
    const host = SRC_HOST[r.key as SourceKey];
    if (!host) continue;
    const rest = (Number(r.views) || 0) - (covered.get(r.key) || 0);
    if (rest > 0) hosts.set(host, (hosts.get(host) || 0) + rest);
  }
  return hosts;
}

export const PERIOD_KEYS = ["today", "yesterday", "7d", "14d"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];
export const PERIOD_LABELS: Record<PeriodKey, { label: string; prevLabel: string }> = {
  today: { label: "Hari ini", prevLabel: "kemarin" },
  yesterday: { label: "Kemarin", prevLabel: "2 hari lalu" },
  "7d": { label: "7 hari", prevLabel: "7 hari sebelumnya" },
  "14d": { label: "14 hari", prevLabel: "14 hari sebelumnya" },
};

/** WIB days of a period and of the period before it (same rule as buildRefPeriods), oldest first. */
export function periodDays(today: string, key: PeriodKey): { cur: string[]; prev: string[] } {
  const len = key === "7d" ? 7 : key === "14d" ? 14 : 1;
  const all = wibDayList(today, STATS14_DAYS * 2);
  const end = key === "yesterday" ? all.length - 1 : all.length;
  return { cur: all.slice(end - len, end), prev: all.slice(Math.max(0, end - 2 * len), end - len) };
}

/** Build the per-period "Sumber" data from the 28 days of breakdown rows. */
export function buildRefPeriods(today: string, rows: BreakdownRow[], extras: RefExtras = {}): RefPeriod[] {
  const totalsByDay = new Map((extras.dayTotals || []).map((d) => [d.day, d]));
  const all = wibDayList(today, STATS14_DAYS * 2);
  const byDay = new Map<string, BreakdownRow[]>();
  for (const r of rows) {
    const l = byDay.get(r.day);
    if (l) l.push(r);
    else byDay.set(r.day, [r]);
  }
  const hostCache = new Map<string, Map<string, number>>();
  const hostsOf = (d: string) => {
    let m = hostCache.get(d);
    if (!m) hostCache.set(d, (m = dayHosts(byDay.get(d) || [])));
    return m;
  };
  const sumHosts = (days: string[]) => {
    const m = new Map<string, number>();
    for (const d of days) for (const [k, v] of hostsOf(d)) m.set(k, (m.get(k) || 0) + v);
    return m;
  };
  const sumKind = (days: string[], kind: BreakdownKind, key?: string) => {
    const m = new Map<string, { views: number; uniq: number }>();
    for (const d of days)
      for (const r of byDay.get(d) || []) {
        if (r.kind !== kind || (key !== undefined && r.key !== key)) continue;
        const e = m.get(r.key) || { views: 0, uniq: 0 };
        e.views += Number(r.views) || 0;
        e.uniq += Number(r.uniq) || 0;
        m.set(r.key, e);
      }
    return m;
  };
  const n = all.length;
  const defs: { key: RefPeriod["key"]; label: string; prevLabel: string; len: number }[] = [
    { key: "today", label: "Hari ini", prevLabel: "kemarin", len: 1 },
    { key: "yesterday", label: "Kemarin", prevLabel: "2 hari lalu", len: 1 },
    { key: "7d", label: "7 hari", prevLabel: "7 hari sebelumnya", len: 7 },
    { key: "14d", label: "14 hari", prevLabel: "14 hari sebelumnya", len: 14 },
  ];
  return defs.map((def) => {
    const end = def.key === "yesterday" ? n - 1 : n;
    const cur = all.slice(end - def.len, end);
    const prev = all.slice(Math.max(0, end - 2 * def.len), end - def.len);
    const c = sumHosts(cur);
    const p = sumHosts(prev);
    const keys = new Set([...c.keys(), ...p.keys()]);
    const sources: RefSource[] = [...keys]
      .map((k) => ({ key: k, group: refGroup(k), views: Math.round(c.get(k) || 0), prev: Math.round(p.get(k) || 0) }))
      .filter((s) => s.views > 0 || s.prev > 0)
      .sort((a, b) => b.views - a.views || b.prev - a.prev);
    const groups = (Object.keys(REF_GROUP_LABELS) as RefGroupKey[]).map((g) => ({
      key: g,
      label: REF_GROUP_LABELS[g],
      views: sources.filter((s) => s.group === g).reduce((a, s) => a + s.views, 0),
      prev: sources.filter((s) => s.group === g).reduce((a, s) => a + s.prev, 0),
    }));
    const ic = sumKind(cur, "src", "internal").get("internal")?.views || 0;
    const ip = sumKind(prev, "src", "internal").get("internal")?.views || 0;
    const cc = sumKind(cur, "utm");
    const cp = sumKind(prev, "utm");
    const campaigns = [...cc.entries()]
      .map(([key, e]) => ({ key, label: utmLabel(key), views: e.views, uniq: e.uniq, prev: cp.get(key)?.uniq || 0 }))
      .sort((a, b) => b.uniq - a.uniq || b.views - a.views)
      .slice(0, 20);
    const sumTot = (days: string[], f: "views" | "uniq") => days.reduce((a, d) => a + (totalsByDay.get(d)?.[f] || 0), 0);
    const dist = def.len > 1 ? extras.distinct?.[def.key] : undefined;
    const people = {
      uniq: Math.round(dist ? dist.cur : sumTot(cur, "uniq")),
      views: Math.round(sumTot(cur, "views")),
      prevUniq: Math.round(dist ? dist.prev : sumTot(prev, "uniq")),
      prevViews: Math.round(sumTot(prev, "views")),
      exact: def.len === 1 || Boolean(dist),
    };
    const kc = sumKind(cur, "country");
    const kp = sumKind(prev, "country");
    const countries = [...kc.entries()]
      .map(([key, e]) => ({ key, uniq: Math.round(e.uniq), views: Math.round(e.views), prevUniq: Math.round(kp.get(key)?.uniq || 0) }))
      .filter((c) => c.uniq > 0 || c.views > 0)
      .sort((a, b) => b.uniq - a.uniq || b.views - a.views);
    let pops: RefPeriod["pops"] = null;
    if (extras.pops) {
      const cs = new Set(cur);
      const ps = new Set(prev);
      pops = { videy: 0, other: 0, prevVidey: 0, prevOther: 0, exo: 0, prevExo: 0, fail: 0, prevFail: 0, tap: 0, prevTap: 0, revisit: 0, prevRevisit: 0 };
      for (const r of extras.pops) {
        const n = Math.max(0, Number(r.n) || 0);
        const exo = Math.max(0, Number(r.exo) || 0);
        const fail = Math.max(0, Number(r.fail) || 0);
        const tap = Math.max(0, Number(r.tap) || 0);
        const revisit = Math.max(0, Number(r.revisit) || 0);
        const v = r.host === "Videy";
        if (cs.has(r.day)) {
          if (v) pops.videy += n;
          else pops.other += n;
          pops.exo += exo;
          pops.fail += fail;
          pops.tap += tap;
          pops.revisit += revisit;
        } else if (ps.has(r.day)) {
          if (v) pops.prevVidey += n;
          else pops.prevOther += n;
          pops.prevExo += exo;
          pops.prevFail += fail;
          pops.prevTap += tap;
          pops.prevRevisit += revisit;
        }
      }
    }
    return {
      key: def.key,
      label: def.label,
      prevLabel: def.prevLabel,
      sources: sources.slice(0, 100),
      groups,
      internal: { views: Math.round(ic), prev: Math.round(ip) },
      campaigns,
      people,
      countries,
      pops,
    };
  });
}

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
  extras: Omit<RefExtras, "dayTotals"> = {},
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
    otherRefs: top(rows.filter((r) => r.kind !== "ref" || classifySource(r.key) === "other"), "ref", cur, 10, "uniq"),
    pages: top(rows, "path", cur, 20, "views"),
    countries: top(rows, "country", cur, 10, "uniq"),
    browsers: top(rows, "browser", cur, 8, "uniq"),
    campaigns: top(rows, "utm", cur, 20, "uniq").map((c) => ({ ...c, label: utmLabel(c.key) })),
    refPeriods: buildRefPeriods(today, rows, { ...extras, dayTotals }),
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
