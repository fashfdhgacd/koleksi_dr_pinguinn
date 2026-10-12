// ExoClick 300x250 banner (zone 6053864) as one card in catalog grids.
// - Same shell as a video card (rounded box 300:250, "iklan" / "sponsor" where the title goes).
// - Server + client render identical markup (hydration safe); no layout shift.
// - ad-provider.js loaded once, async, only when the slot nears the viewport.
// - serve pushed once per mounted slot (SPA remount => new push). Ad blockers: fails silently.
import { useEffect, useRef } from "react";

const ZONE_ID = "6053864";
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

export function AdSlot() {
  const ref = useRef<HTMLDivElement>(null);
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
    <div className="block rounded-xl p-1 sm:p-1.5" aria-label="Iklan">
      <div
        ref={ref}
        className="relative flex aspect-[300/250] items-center justify-center overflow-hidden rounded-xl bg-surface-2"
      >
        <ins className="eas6a97888e2" data-zoneid={ZONE_ID} />
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
