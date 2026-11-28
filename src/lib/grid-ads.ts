// Catalog grid ad plan (pure, no DOM) so it can be tested with node --test.
//
// ExoClick flagged zone 6053864 (27 Nov 2026, "low traffic uniqueness") because that one 300x250 zone
// was repeated 6-7 times on every catalog page. Rules now:
// - At most MAX_GRID_ADS (6) ad slots per page per breakpoint, slotIndex 0..5 in order.
// - All six slots are distinct ExoClick 300x250 banners (site 1115596). No TrafficStars banners,
//   no In-Page Push, no repeated zone IDs. Do not invent zone IDs.
// - A slot without a zone ID renders nothing (no placeholder, no video displaced) and never falls back to
//   another slot's or another network's zone.
// - No refresh / rotation anywhere: each slot loads once when it nears the viewport.
// Positions are unchanged: phone after every 4th video (count % 4 === 0), laptop (lg) after videos
// 2, 7, 12, ... (count % 5 === 2). Phone and laptop each count their own slotIndex; a slot meant for the
// other breakpoint is display:none, never intersects and so never requests an ad.

export type AdNetwork = "exoclick" | "trafficstars";
export type GridSlot = { network: AdNetwork; zoneId: string };
export type Breakpoint = "mobile" | "desktop";

/** ExoClick 300x250 zones (site 1115596). Six distinct zones, one per grid slot.
 * EXO_ZONE_5/6 fill the two former TrafficStars banner slots. They were unused active
 * Banner 300x250 zones; 6111374/6111376 stay unused because they were the old TS-slot fallbacks. */
export const EXO_ZONE_1 = "6053864";
export const EXO_ZONE_2 = "6111252";
export const EXO_ZONE_3 = "6111370";
export const EXO_ZONE_4 = "6111372";
export const EXO_ZONE_5 = "6056216";
export const EXO_ZONE_6 = "6056218";
export const MAX_GRID_ADS = 6;

/** Slot config by slotIndex. */
export const GRID_SLOTS: readonly GridSlot[] = [
  { network: "exoclick", zoneId: EXO_ZONE_1 },
  { network: "exoclick", zoneId: EXO_ZONE_2 },
  { network: "exoclick", zoneId: EXO_ZONE_5 },
  { network: "exoclick", zoneId: EXO_ZONE_3 },
  { network: "exoclick", zoneId: EXO_ZONE_6 },
  { network: "exoclick", zoneId: EXO_ZONE_4 },
];

/** ExoClick 300x250 fallback zone per non-ExoClick slotIndex. Empty: every live slot is already
 * ExoClick, so nothing swaps. Kept so a future non-ExoClick slot can wire a distinct fallback
 * without inventing a zone. "" = none. */
export const EXO_FALLBACK_ZONES: Readonly<Record<number, string>> = {};

/** ExoClick fallback zone for a slot, or null (no fallback configured / slot is already ExoClick). */
export function fallbackZone(
  slotIndex: number,
  slots: readonly GridSlot[] = GRID_SLOTS,
  fallbacks: Readonly<Record<number, string>> = EXO_FALLBACK_ZONES,
): string | null {
  const slot = slots[slotIndex];
  if (!slot || slot.network === "exoclick") return null;
  return fallbacks[slotIndex] || null;
}

/** ExoClick zones actually wired (shown on /pemilik). */
export const EXO_ZONES: readonly string[] = [
  ...GRID_SLOTS.filter((s) => s.network === "exoclick" && s.zoneId).map((s) => s.zoneId),
  ...Object.values(EXO_FALLBACK_ZONES).filter(Boolean),
];

/** The live slot for a slotIndex, or null when it must render nothing (out of range or no zone ID).
 * Never substitutes another zone. */
export function gridSlot(slotIndex: number, slots: readonly GridSlot[] = GRID_SLOTS): GridSlot | null {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_GRID_ADS) return null;
  const slot = slots[slotIndex];
  if (!slot || !slot.zoneId) return null;
  return slot;
}

export type GridCell =
  | { kind: "video"; index: number; hidden: Readonly<Record<Breakpoint, boolean>> }
  | { kind: "ad"; key: string; breakpoint: Breakpoint; slotIndex: number; slot: GridSlot };

/** Columns of the catalog grid per breakpoint (CATALOG_GRID: grid-cols-1, lg:grid-cols-3). */
export const GRID_COLS: Readonly<Record<Breakpoint, number>> = { mobile: 1, desktop: 3 };

const RULES: Readonly<Record<Breakpoint, (count: number) => boolean>> = {
  mobile: (count) => count % 4 === 0,
  desktop: (count) => count % 5 === 2,
};

/** "Ad after video #p" positions (1-based, nondecreasing) for one breakpoint: always exactly `max` of them
 * when there is at least one video. The usual rule is kept whenever it yields `max` slots (full pages);
 * shorter pages (last page, landing pages of 24, home minus hero) spread the slots evenly instead. */
export function adPositions(videoCount: number, bp: Breakpoint, max = MAX_GRID_ADS): number[] {
  if (videoCount <= 0 || max <= 0) return [];
  const rule: number[] = [];
  for (let count = 1; count <= videoCount && rule.length < max; count++) if (RULES[bp](count)) rule.push(count);
  if (rule.length === max) return rule;
  return Array.from({ length: max }, (_, i) => Math.min(videoCount, Math.max(1, Math.round(((i + 0.5) * videoCount) / max))));
}

/** Cell order for a catalog grid. Every page gets exactly MAX_GRID_ADS ad cells per breakpoint (slotIndex
 * 0..5, all configured), ad cells carry stable keys (`ad-mobile-N` / `ad-desktop-N`, no re-request on
 * re-render), and trailing videos are hidden per breakpoint so the visible cell count is a multiple of the
 * columns: every row is full, no holes (except a last page of only 1-2 videos, which keeps them). Ad cells never disappear, so this count holds after load too. */
export function planGrid(
  videoCount: number,
  showAds: boolean,
  slots: readonly GridSlot[] = GRID_SLOTS,
  cols: Readonly<Record<Breakpoint, number>> = GRID_COLS,
): GridCell[] {
  const after: Record<Breakpoint, Map<number, GridCell[]>> = { mobile: new Map(), desktop: new Map() };
  const hidden: Record<Breakpoint, Set<number>> = { mobile: new Set(), desktop: new Set() };
  for (const bp of ["mobile", "desktop"] as const) {
    if (!showAds) continue;
    let ads = 0;
    adPositions(videoCount, bp).forEach((pos, slotIndex) => {
      const slot = gridSlot(slotIndex, slots);
      if (!slot) return;
      ads++;
      const list = after[bp].get(pos) || [];
      list.push({ kind: "ad", key: `ad-${bp}-${slotIndex}`, breakpoint: bp, slotIndex, slot });
      after[bp].set(pos, list);
    });
    const k = Math.max(1, cols[bp]);
    const trim = (videoCount + ads) % k;
    // Never trim a tiny last page down to no / almost no videos (1-2 videos: keep them, last row short).
    if (videoCount - trim >= k) for (let i = 0; i < trim; i++) hidden[bp].add(videoCount - 1 - i);
  }
  const cells: GridCell[] = [];
  for (let index = 0; index < videoCount; index++) {
    cells.push({ kind: "video", index, hidden: { mobile: hidden.mobile.has(index), desktop: hidden.desktop.has(index) } });
    for (const bp of ["mobile", "desktop"] as const) cells.push(...(after[bp].get(index + 1) || []));
  }
  return cells;
}

/** Cells visible on one breakpoint, in order. */
export function visibleCells(cells: GridCell[], bp: Breakpoint): GridCell[] {
  return cells.filter((c) => (c.kind === "video" ? !c.hidden[bp] : c.breakpoint === bp));
}
