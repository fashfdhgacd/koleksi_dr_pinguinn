import type { ReactNode } from "react";
import type { GridSlot } from "@/lib/grid-ads";
import { AdSlot } from "@/components/grid-cell";

/** One grid ad cell for a resolved slot (src/lib/grid-ads.ts). All six live slots are ExoClick 300x250. */
export function GridAd({ slot, className = "" }: { slot: GridSlot; slotIndex?: number; className?: string }): ReactNode {
  if (!slot.zoneId) return null;
  return <AdSlot zoneId={slot.zoneId} className={className} />;
}
