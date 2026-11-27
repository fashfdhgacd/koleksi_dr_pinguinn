// TrafficStars 300x250 spot (data-ts-spot code from src/lib/grid-ads.ts) as one grid card.
// Restored from 385b07c (removed in "Iklan audit (#64)"): client-side only, the SDK script is injected
// into the slot element once, when the slot first nears the viewport; the cell is reserved up front
// (same shell as an ExoClick card, no layout shift); if nothing fills within 8s onEmpty fires (GridAd then
// swaps the cell once to an ExoClick fallback zone; without one the empty frame stays, never removed).
// No refresh / rotation.
import { useEffect, useRef, useState } from "react";
import { AdCardShell, FILL_TIMEOUT_MS, onceNearViewport, useFitScale, useReportEmpty } from "@/components/grid-cell";

const SDK_SRC = "https://cdn.gajukogyxywahu.com/sdk/v1/dd.ms.js";
const DOMAIN = "gajukogyxywahu.com";

function hasAd(el: HTMLElement): boolean {
  if (el.querySelector("iframe, img, video, ins, a[href]")) return true;
  return Array.from(el.children).some((c) => c.tagName !== "SCRIPT" && (c as HTMLElement).offsetHeight > 20);
}

export function TsGridAd({ spot, className = "", onEmpty }: { spot: string; className?: string; onEmpty?: () => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const injected = useRef(false);
  const [empty, setEmpty] = useState(false);
  const scale = useFitScale(frameRef);
  useReportEmpty(empty, onEmpty);

  useEffect(() => {
    const frame = frameRef.current;
    const el = innerRef.current;
    if (!frame || !el || !spot || injected.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let mo: MutationObserver | undefined;
    const stop = onceNearViewport(frame, () => {
      if (injected.current || !frame.clientWidth) return;
      injected.current = true;
      mo = new MutationObserver(() => {
        if (hasAd(el)) {
          mo?.disconnect();
          if (timer) clearTimeout(timer);
        }
      });
      mo.observe(el, { childList: true, subtree: true });
      const s = document.createElement("script");
      s.src = SDK_SRC;
      s.async = true;
      s.defer = true;
      s.setAttribute("data-ts-spot", spot);
      s.setAttribute("data-ts-domain", DOMAIN);
      s.onerror = () => setEmpty(true);
      el.appendChild(s);
      timer = setTimeout(() => {
        if (!hasAd(el)) setEmpty(true);
      }, FILL_TIMEOUT_MS);
    });
    return () => {
      stop();
      mo?.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [spot]);

  return <AdCardShell network="trafficstars" className={className} frameRef={frameRef} innerRef={innerRef} scale={scale} />;
}
