/**
 * Page popunder cap: 3 successful opens per calendar day in Asia/Jakarta, shared by every page.
 * In-video popunders and Videy preroll do not use this. A new Jakarta date starts the count at zero.
 */

export const PAGE_POP_MAX_PER_DAY = 3;

export type PagePopDay = { day: string; n: number };

/** YYYY-MM-DD in Asia/Jakarta. */
export function jakartaDay(now: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export function pagePopAllowed(state: PagePopDay | null, now: number, max = PAGE_POP_MAX_PER_DAY): boolean {
  if (!state || state.day !== jakartaDay(now)) return true;
  return state.n < max;
}

export function nextPagePop(state: PagePopDay | null, now: number): PagePopDay {
  const day = jakartaDay(now);
  const n = state && state.day === day ? state.n : 0;
  return { day, n: n + 1 };
}
