import { useState, type ReactNode } from "react";
import { fallbackZone, type GridSlot } from "@/lib/grid-ads";
import { AdSlot } from "@/components/grid-cell";
import { TsGridAd } from "@/components/ts-grid-ad";
import { WynqGridAd } from "@/components/wynq-grid-ad";

/** One grid ad cell for a resolved slot (src/lib/grid-ads.ts). The cell never disappears: a TrafficStars /
 * Wynq ad still unfilled after the fill timeout is swapped ONCE to that slot's own ExoClick fallback zone
 * (distinct from every other zone on the page). No swap back, no refresh. */
export function GridAd({ slot, slotIndex, className = "" }: { slot: GridSlot; slotIndex: number; className?: string }): ReactNode {
  const [fallback, setFallback] = useState<string | null>(null);
  if (!slot.zoneId) return null;
  if (fallback) return <AdSlot key={`exo-${fallback}`} zoneId={fallback} className={className} />;
  const onEmpty = () => setFallback((cur) => cur ?? fallbackZone(slotIndex));
  if (slot.network === "exoclick") return <AdSlot zoneId={slot.zoneId} className={className} />;
  if (slot.network === "trafficstars") return <TsGridAd spot={slot.zoneId} className={className} onEmpty={onEmpty} />;
  if (slot.network === "wynq") return <WynqGridAd zoneId={slot.zoneId} className={className} onEmpty={onEmpty} />;
  return null;
}
