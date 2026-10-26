// ExoClick 300x250 banners (zones AD_ZONES, one per slot) as cards in catalog grids.
// - Same shell as a video card (rounded box 300:250, "iklan" / "sponsor" where the title goes).
// - The 300x250 banner is centred in the box; when the card is narrower it is scaled down to fit.
// - Server + client render identical markup (hydration safe); no layout shift.
// - ad-provider.js loaded once, async, only when the slot nears the viewport.
// - serve pushed once per mounted slot (SPA remount => new push). Ad blockers: fails silently.
// - A slot hidden with display:none (other breakpoint) never intersects, so it never requests an ad.
import { useEffect, useRef, useState } from "react";

/** Grid banner zone: ExoClick 300x250 6053864 for every grid slot (restored 26 Okt 2026, replacing the
 * TrafficStars MasterSpot whose 300x100/300x250 children paid $0.003-0.005 eCPM vs ExoClick ~$0.016). */
export const AD_ZONES = ["6053864"] as const;
const SCRIPT_ID = "exo-ad-provider";
const SCRIPT_SRC = "https://a.magsrv.com/ad-provider.js";

type AdWindow = Window & { AdProvider?: Array<Record<string, unknown>> };

function ensureScript() {
  if (document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.async = true;
  s.type = "application/javascript";
  s.src = SCRIPT_SRC;
  s.onerror = () => {};
  document.head.appendChild(s);
}

export function AdSlot({ className = "", zoneId = AD_ZONES[0] }: { className?: string; zoneId?: string } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setScale(Math.min(1, w / 300, h / 250));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let done = false;
    const serve = () => {
      if (done) return;
      done = true;
      try {
        ensureScript();
        const w = window as AdWindow;
        (w.AdProvider = w.AdProvider || []).push({ serve: {} });
      } catch {
        /* blocked or failed: stay blank */
      }
    };
    if (typeof IntersectionObserver === "undefined") {
      serve();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          serve();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div data-kdp-ad="exoclick" className={`block rounded-xl p-1 sm:p-1.5 ${className}`} aria-label="Iklan">
      <div
        ref={ref}
        className="relative flex aspect-[300/250] items-center justify-center overflow-hidden rounded-xl bg-surface-2"
      >
        <div
          className="flex h-[250px] w-[300px] shrink-0 items-center justify-center"
          style={{ transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: "center" }}
        >
          <ins className="eas6a97888e2" data-zoneid={zoneId} />
        </div>
      </div>
      <div className="px-1 pb-1 pt-2.5 sm:px-1.5 sm:pt-3">
        <h3 className="line-clamp-2 min-h-[2.5em] text-[13px] font-medium leading-snug text-foreground sm:text-[15px]">
          iklan
        </h3>
        <div className="mt-1.5 text-[11px] text-muted sm:text-xs">sponsor</div>
      </div>
    </div>
  );
}
