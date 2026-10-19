/**
 * Traffic safety valve (Oct 2026, $20/month hard ceiling incl. the $5 base).
 *
 * Analytics is the only per-pageview work that is not needed to watch videos: one POST /api/online
 * per page plus 3 D1 writes. When the day's traffic gets large, it is SAMPLED instead of recorded for
 * every visitor:
 *  - The rate 1-in-N is picked from today's pageviews (D1 analytics_hourly, read at most every few
 *    minutes per isolate, see analytics-d1 d1TrafficLevel). Below VALVE_LEVELS[0] nothing changes.
 *  - A visitor is in or out of the sample by a stable hash of their visitor id, so a sampled-in
 *    visitor keeps all their pageviews (uniques, sessions, top lists stay proportional) and a
 *    sampled-out visitor sends no more pings that day (the client learns N from the first answer).
 *  - Recorded events carry weight N, and every count in the owner panel sums the weights, so totals
 *    stay estimates of the real numbers instead of dropping.
 * Video pages, the catalog, likes and the upload queue never go through this.
 *
 * Pure module (no server imports): used by the Worker (online.ts) and the browser (presence-ping).
 */

/** [projected pageviews per day, sample 1-in-N]; highest matching row wins. */
export const VALVE_LEVELS: ReadonlyArray<readonly [number, number]> = [
  [150_000, 2],
  [300_000, 4],
  [600_000, 10],
  [1_500_000, 25],
];

/** 1-in-N for a projected daily pageview volume. */
export function sampleFor(projectedPerDay: number): number {
  let n = 1;
  for (const [min, rate] of VALVE_LEVELS) if (projectedPerDay >= min) n = rate;
  return n;
}

/** FNV-1a 32-bit hash of a string (same in Worker and browser). */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Whether a visitor id is recorded at sample rate 1-in-n. */
export function inSample(id: string, n: number): boolean {
  if (!(n > 1)) return true;
  return hashId(id) % Math.floor(n) === 0;
}

/** WIB calendar day 'YYYY-MM-DD'. */
export function wibDayKey(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}
