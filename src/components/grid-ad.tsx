import type { ReactNode } from "react";
import type { GridSlot } from "@/lib/grid-ads";
import { AdSlot } from "@/components/ad-slot";
import { TsGridAd } from "@/components/ts-grid-ad";

/** One grid ad cell for a resolved slot (src/lib/grid-ads.ts). Never substitutes another zone.
 * Wynq renders nothing for now. TODO: add the Wynq zone embed here once WYNQ_ZONE_1/2 exist and
 * WYNQ_ENABLED is true. */
export function GridAd({ slot, className = "" }: { slot: GridSlot; className?: string }): ReactNode {
  if (!slot.zoneId) return null;
  if (slot.network === "exoclick") return <AdSlot zoneId={slot.zoneId} className={className} />;
  if (slot.network === "trafficstars") return <TsGridAd spot={slot.zoneId} className={className} />;
  return null;
}
