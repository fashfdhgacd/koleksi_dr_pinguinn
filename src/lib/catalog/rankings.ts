/**
 * Ranking pages /kategori/paling-ditonton and /kategori/paling-disukai (client-safe metadata only;
 * the list itself is built server-side in ranking-list.ts).
 *
 * Periods: "Sepanjang masa" uses the cumulative stats. "Minggu ini" / "Bulan ini" use deltas between
 * daily snapshots written by the 12-hourly stats workflow (scripts/stats-snapshot.py). A period tab is
 * only enabled once rank-periods-meta.json says enough history exists; until then it shows "segera".
 * The period travels inside the catalog category key ("paling-ditonton~minggu"), so the existing
 * /api/data + feed cache need no changes.
 */
import meta from "./rank-periods-meta.json";

export type RankKind = "views" | "likes";
export type RankPeriod = "all" | "week" | "month";
export type RankingDef = { slug: string; label: string; kind: RankKind };
export type PeriodDef = { key: "" | "minggu" | "bulan"; period: RankPeriod; label: string; days: number };

export const RANKINGS: RankingDef[] = [
  { slug: "paling-ditonton", label: "Paling Banyak Ditonton", kind: "views" },
  { slug: "paling-disukai", label: "Paling Banyak Disukai", kind: "likes" },
];

export const RANK_PERIODS: PeriodDef[] = [
  { key: "minggu", period: "week", label: "Minggu ini", days: 7 },
  { key: "bulan", period: "month", label: "Bulan ini", days: 30 },
  { key: "", period: "all", label: "Sepanjang masa", days: 0 },
];

type PeriodMeta = { from: string; to: string; days: number } | null;
type Meta = { firstSnapshot: string | null; week: PeriodMeta; month: PeriodMeta };
const META = meta as unknown as Meta;

export function findRanking(slug: string | null | undefined): RankingDef | undefined {
  const key = String(slug || "").trim().toLowerCase();
  return RANKINGS.find((r) => r.slug === key);
}

export function periodFromKey(key: unknown): PeriodDef {
  const k = String(key || "").trim().toLowerCase();
  return RANK_PERIODS.find((p) => p.key === k && p.key !== "") || RANK_PERIODS[2];
}

export function periodInfo(period: RankPeriod): PeriodMeta {
  if (period === "week") return META.week || null;
  if (period === "month") return META.month || null;
  return null;
}

export function periodAvailable(period: RankPeriod): boolean {
  return period === "all" || Boolean(periodInfo(period));
}

/** Earliest date (YYYY-MM-DD) a period can appear, from the first stored snapshot; null = unknown. */
/** Day the site's own D1 pageview log starts (views week/month tabs never reach before it). */
export const SITE_VIEWS_FROM = "2026-10-05";

function wibToday(now = Date.now()): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Period range for a ranking. Views week/month come from the site's own pageviews (D1), so they are
 * always available: the range is the last 7/30 WIB days, clamped to SITE_VIEWS_FROM. Likes keep the
 * snapshot-based meta.
 */
export function rankPeriodInfo(kind: RankKind, period: RankPeriod, now = Date.now()): PeriodMeta {
  if (kind !== "views" || period === "all") return periodInfo(period);
  const to = wibToday(now);
  const span = period === "week" ? 7 : 30;
  let from = new Date(Date.parse(`${to}T00:00:00Z`) - (span - 1) * 86_400_000).toISOString().slice(0, 10);
  if (from < SITE_VIEWS_FROM) from = SITE_VIEWS_FROM;
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return { from, to, days };
}

export function rankPeriodAvailable(kind: RankKind, period: RankPeriod): boolean {
  return kind === "views" ? true : periodAvailable(period);
}

export function periodExpectedFrom(period: RankPeriod): string | null {
  if (period === "all" || !META.firstSnapshot) return null;
  const days = period === "week" ? 7 : 30;
  const t = Date.parse(`${META.firstSnapshot}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** Catalog category key for a ranking + period ("paling-ditonton" or "paling-ditonton~minggu"). */
export function rankingKey(slug: string, periodKey: string | undefined): string {
  const p = periodFromKey(periodKey);
  return p.key ? `${slug}~${p.key}` : slug;
}

export function parseRankingKey(category: string | null | undefined): { def: RankingDef; period: PeriodDef } | null {
  const [slug, p] = String(category || "").trim().toLowerCase().split("~");
  const def = findRanking(slug);
  if (!def) return null;
  return { def, period: periodFromKey(p) };
}

export function rankingSeo(def: RankingDef, period: RankPeriod = "all"): { title: string; h1: string; description: string; intro: string } {
  const year = new Date().getFullYear();
  if (def.kind === "views") {
    if (period === "week" || period === "month") {
      const word = period === "week" ? "minggu ini" : "bulan ini";
      const span = period === "week" ? "7 hari" : "30 hari";
      return {
        h1: "Bokep Indo Paling Banyak Ditonton",
        title: `Bokep Indo Paling Banyak Ditonton ${word.replace(/^./, (c) => c.toUpperCase())} ${year} | koleksidrpinguin.com`,
        description: `Bokep indo paling banyak ditonton ${word} di Dr. Pinguin, dari video viral terbaru sampai videy viral.`,
        intro: `Kumpulan bokep indo paling banyak ditonton ${word} di koleksidrpinguin.com. Urutannya dari jumlah tayangan pengunjung situs ini selama ${span} terakhir, jadi video viral terbaru dan videy viral yang lagi ramai langsung naik ke atas.`,
      };
    }
    return {
      h1: "Bokep Indo Paling Banyak Ditonton",
      title: `Bokep Indo Paling Banyak Ditonton ${year} | koleksidrpinguin.com`,
      description:
        "Bokep indo paling banyak ditonton minggu ini dan bulan ini di Dr. Pinguin, dari video viral terbaru sampai videy viral.",
      intro: "Bokep indo paling banyak ditonton sepanjang masa, diurutkan dari total tayangan. Diperbarui otomatis tiap 12 jam.",
    };
  }
  return {
    h1: "Bokep Indo Paling Banyak Disukai",
    title: `Bokep Indo Paling Banyak Disukai ${year} | koleksidrpinguin.com`,
    description:
      "Daftar video paling banyak disukai di Dr. Pinguin: suka dari sumber ditambah suka pengunjung situs ini. Diperbarui otomatis. Khusus 18+.",
    intro:
      "Video dengan jumlah suka terbanyak: suka dari sumber video ditambah tombol suka pengunjung di situs ini. Khusus pengunjung 18 tahun ke atas.",
  };
}
