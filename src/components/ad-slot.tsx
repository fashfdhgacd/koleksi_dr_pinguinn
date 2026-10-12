// ExoClick 300x250 banner (zone 6053856) as a grid cell in listing grids.
// - Fixed 300x250 box (no layout shift); server + client render identical markup (hydration safe).
// - ad-provider.js loaded once, async, only when the slot nears the viewport.
// - serve pushed once per mounted slot (SPA remount => new push). Ad blockers: fails silently.
import { useEffect, useRef } from "react";

const ZONE_ID = "6053856";
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
    <div className="col-span-full flex flex-col items-center py-1" aria-label="Iklan">
      <span className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">Iklan</span>
      <div
        ref={ref}
        className="h-[250px] w-[300px] overflow-hidden border border-neutral-800 bg-neutral-950"
      >
        <ins className="eas6a97888e17" data-zoneid={ZONE_ID} />
      </div>
    </div>
  );
}
