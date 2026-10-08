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

export function rankingSeo(def: RankingDef): { title: string; h1: string; description: string; intro: string } {
  const year = new Date().getFullYear();
  if (def.kind === "views") {
    return {
      h1: "Bokep Indo Paling Banyak Ditonton",
      title: `Bokep Indo Paling Banyak Ditonton ${year} | koleksidrpinguin.com`,
      description:
        "Daftar video paling banyak ditonton di Dr. Pinguin, diurutkan dari jumlah tayangan. Diperbarui otomatis tiap 12 jam. Khusus 18+.",
      intro:
        "Video dengan jumlah tayangan terbanyak, diurutkan otomatis dari statistik sumber yang diperbarui tiap 12 jam. Khusus pengunjung 18 tahun ke atas.",
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
