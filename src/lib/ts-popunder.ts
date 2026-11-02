// Popunder figure for /pemilik, read from TrafficStars' own report (public/data/trafficstars.json,
// written by scripts/trafficstars-sync.mjs twice a day). TrafficStars is what pays, so its numbers
// are the main figure. Its days are UTC days: 00:00 UTC = 07:00 WIB, so "today" here runs from
// 07:00 WIB to 07:00 WIB the next morning, NOT from midnight WIB like our own site counters.
// Pure functions only (no fetch), so they can be tested with node --test.

export const POPUNDER_SPOT_ID = "5210859";

type Spot = { id: string; impressions?: number; earnings?: number };
export type TsJson = {
  updatedAt?: string;
  days?: { date: string; impressions?: number; earnings?: number }[];
  spots?: { date: string; spots?: Spot[] }[];
};

export type TsPopDay = { date: string; impressions: number; earnings: number };
export type TsPopSummary = {
  /** Current TrafficStars (UTC) day; null when the JSON has no row for it yet. */
  today: TsPopDay | null;
  /** Previous UTC day (complete). */
  yesterday: TsPopDay | null;
  /** When the JSON was last synced (ISO), shown so the owner knows how fresh "today" is. */
  updatedAt: string | null;
};

/** UTC calendar date (YYYY-MM-DD) `offsetDays` before `now`. */
export function utcDate(now: number, offsetDays = 0): string {
  return new Date(now - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function popOf(data: TsJson, date: string): TsPopDay | null {
  const day = (data.spots || []).find((d) => d.date === date);
  const s = day?.spots?.find((x) => String(x.id) === POPUNDER_SPOT_ID);
  if (!day) return null;
  return { date, impressions: Number(s?.impressions) || 0, earnings: Number(s?.earnings) || 0 };
}

export function tsPopunderSummary(data: TsJson | null | undefined, now = Date.now()): TsPopSummary {
  if (!data) return { today: null, yesterday: null, updatedAt: null };
  return {
    today: popOf(data, utcDate(now, 0)),
    yesterday: popOf(data, utcDate(now, 1)),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

/** "2 Nov 07.00 – 3 Nov 07.00 WIB" for a TrafficStars UTC day. */
export function tsDayWindowWib(date: string): string {
  const start = Date.parse(date + "T00:00:00Z");
  if (Number.isNaN(start)) return date;
  const f = (t: number) =>
    new Date(t).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${f(start)} – ${f(start + 86_400_000)} WIB`;
}
