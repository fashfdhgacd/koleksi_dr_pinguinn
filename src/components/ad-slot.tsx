// Catalog grid ad cards (ExoClick 300x250 + TrafficStars 300x250), one per slot from src/lib/grid-ads.ts.
// - Same shell as a video card (16:10 box, "iklan" / "sponsor" where the title goes).
// - The 300x250 banner is centred in the box; when the card is narrower it is scaled down to fit.
// - Server + client render identical markup (hydration safe); the zone is only attached on the client.
// - ExoClick: ad-provider.js loaded once per page (async), one <ins data-zoneid> per slot, one serve push
//   per mounted slot when it first nears the viewport. No refresh, no interval, no rotation.
// - A slot hidden with display:none (other breakpoint) never intersects, so it never requests an ad.
import { useEffect, useRef, useState } from "react";
import { EXO_ZONES } from "@/lib/grid-ads";

/** ExoClick zones wired into the grid (distinct, one slot each). Read by /pemilik. */
export const AD_ZONES = EXO_ZONES;
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

/** Scale factor that fits a 300x250 creative into the element (never up). */
export function useFitScale(ref: React.RefObject<HTMLDivElement | null>) {
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
  }, [ref]);
  return scale;
}

/** Runs `load` once, the first time `el` comes within 400px of the viewport. */
export function onceNearViewport(el: HTMLElement, load: () => void): () => void {
  if (typeof IntersectionObserver === "undefined") {
    load();
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        load();
      }
    },
    { rootMargin: "400px 0px" },
  );
  io.observe(el);
  return () => io.disconnect();
}

/** Video-card-shaped shell with a centred 300x250 frame. */
export function AdCardShell({
  network,
  className = "",
  frameRef,
  innerRef,
  scale,
}: {
  network: string;
  className?: string;
  frameRef: React.RefObject<HTMLDivElement | null>;
  innerRef?: React.RefObject<HTMLDivElement | null>;
  scale: number;
}) {
  return (
    <div data-kdp-ad={network} className={`rounded-none p-1 sm:p-1.5 ${className}`} aria-label="Iklan">
      <div
        ref={frameRef}
        className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-none bg-transparent"
      >
        <div
          ref={innerRef}
          className="flex h-[250px] w-[300px] shrink-0 items-center justify-center"
          style={{ transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: "center" }}
        />
      </div>
      <div className="px-1 pb-1 pt-2.5 sm:px-1.5 sm:pt-3">
        <h3 className="line-clamp-2 min-h-[2.75em] text-xs font-medium leading-snug text-foreground sm:text-[15px]">
          iklan
        </h3>
        <div className="mt-1.5 text-[11px] text-muted sm:text-xs">sponsor</div>
      </div>
    </div>
  );
}

/** ExoClick 300x250 banner for one zone. */
export function AdSlot({ className = "", zoneId }: { className?: string; zoneId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const served = useRef(false);
  const scale = useFitScale(ref);
  useEffect(() => {
    const el = ref.current;
    if (!el || !zoneId || served.current) return;
    return onceNearViewport(el, () => {
      if (served.current || !el.clientWidth) return;
      served.current = true;
      try {
        if (!el.querySelector("ins")) {
          const ins = document.createElement("ins");
          ins.className = "eas6a97888e2";
          ins.dataset.zoneid = zoneId;
          el.firstElementChild?.appendChild(ins);
        }
        ensureScript();
        const w = window as AdWindow;
        (w.AdProvider = w.AdProvider || []).push({ serve: {} });
      } catch {
        /* blocked or failed: stay blank */
      }
    });
  }, [zoneId]);
  return <AdCardShell network="exoclick" className={className} frameRef={ref} scale={scale} />;
}
