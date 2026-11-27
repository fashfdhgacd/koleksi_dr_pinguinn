// Catalog grid ad plan (pure, no DOM) so it can be tested with node --test.
//
// ExoClick flagged zone 6053864 (27 Nov 2026, "low traffic uniqueness") because that one 300x250 zone
// was repeated 6-7 times on every catalog page. Rules now:
// - At most MAX_GRID_ADS (6) ad slots per page per breakpoint, slotIndex 0..5 in order.
// - Every slot has its own zone/spot; no zone ID appears twice in one view.
// - A slot without a zone ID renders nothing (no placeholder, no video displaced) and never falls back to
//   another slot's or another network's zone.
// - No refresh / rotation anywhere: each slot loads once when it nears the viewport.
// Positions are unchanged: phone after every 4th video (count % 4 === 0), laptop (lg) after videos
// 2, 7, 12, ... (count % 5 === 2). Phone and laptop each count their own slotIndex; a slot meant for the
// other breakpoint is display:none, never intersects and so never requests an ad.

export type AdNetwork = "exoclick" | "trafficstars" | "wynq";
export type GridSlot = { network: AdNetwork; zoneId: string };
export type Breakpoint = "mobile" | "desktop";

/** ExoClick 300x250 zones (site 1115596). Two distinct zones, one each. */
export const EXO_ZONE_1 = "6053864";
export const EXO_ZONE_2 = "6111252";
/** TrafficStars 300x250 MasterSpot 5210857 (data-ts-spot code). */
export const TS_SPOT_1 = "31bf06c374434eb39d1675268d1608a5";
/** TODO: second TrafficStars 300x250 spot (dashboard spot creation returned HTTP 500 on 27 Nov 2026). */
export const TS_SPOT_2 = "";
/** TODO: Wynq 300x250 zone IDs once the site is approved and zones exist. */
export const WYNQ_ZONE_1 = "";
export const WYNQ_ZONE_2 = "";
/** Wynq site script (rapidfire.cc). Off until Wynq is ready; flip to true to load it. */
export const WYNQ_ENABLED = false;
export const WYNQ_SITE_SCRIPT_SRC = "https://rapidfire.cc/s.js";
export const WYNQ_SITE_ID = "0SBV0CWY9FC1A";

export const MAX_GRID_ADS = 6;

/** Slot config by slotIndex. */
export const GRID_SLOTS: readonly GridSlot[] = [
  { network: "exoclick", zoneId: EXO_ZONE_1 },
  { network: "trafficstars", zoneId: TS_SPOT_1 },
  { network: "wynq", zoneId: WYNQ_ZONE_1 },
  { network: "exoclick", zoneId: EXO_ZONE_2 },
  { network: "trafficstars", zoneId: TS_SPOT_2 },
  { network: "wynq", zoneId: WYNQ_ZONE_2 },
];

/** ExoClick zones actually wired (shown on /pemilik). */
export const EXO_ZONES: readonly string[] = GRID_SLOTS.filter((s) => s.network === "exoclick" && s.zoneId).map(
  (s) => s.zoneId,
);

/** The live slot for a slotIndex, or null when it must render nothing (out of range, no zone ID, or
 * Wynq while WYNQ_ENABLED is false). Never substitutes another zone. */
export function gridSlot(slotIndex: number, slots: readonly GridSlot[] = GRID_SLOTS, wynqEnabled = WYNQ_ENABLED): GridSlot | null {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_GRID_ADS) return null;
  const slot = slots[slotIndex];
  if (!slot || !slot.zoneId) return null;
  if (slot.network === "wynq" && !wynqEnabled) return null;
  return slot;
}

export type GridCell =
  | { kind: "video"; index: number }
  | { kind: "ad"; key: string; breakpoint: Breakpoint; slotIndex: number; slot: GridSlot };

/** Cell order for a catalog grid of `videoCount` videos. Ad cells carry stable keys
 * (`ad-mobile-N` / `ad-desktop-N`) so a re-render keeps the same mounted slot (no second request). */
export function planGrid(
  videoCount: number,
  showAds: boolean,
  slots: readonly GridSlot[] = GRID_SLOTS,
  wynqEnabled = WYNQ_ENABLED,
): GridCell[] {
  const cells: GridCell[] = [];
  let mobileIdx = 0;
  let desktopIdx = 0;
  for (let index = 0; index < videoCount; index++) {
    cells.push({ kind: "video", index });
    if (!showAds) continue;
    const count = index + 1;
    if (count % 4 === 0 && mobileIdx < MAX_GRID_ADS) {
      const slotIndex = mobileIdx++;
      const slot = gridSlot(slotIndex, slots, wynqEnabled);
      if (slot) cells.push({ kind: "ad", key: `ad-mobile-${slotIndex}`, breakpoint: "mobile", slotIndex, slot });
    }
    if (count % 5 === 2 && desktopIdx < MAX_GRID_ADS) {
      const slotIndex = desktopIdx++;
      const slot = gridSlot(slotIndex, slots, wynqEnabled);
      if (slot) cells.push({ kind: "ad", key: `ad-desktop-${slotIndex}`, breakpoint: "desktop", slotIndex, slot });
    }
  }
  return cells;
}
