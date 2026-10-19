// TrafficStars MasterSpot (spot 5210857) as one video-card-sized cell in catalog grids (home, kategori).
// Client-side only: the SDK script is injected into the slot element when the slot nears the
// viewport, once per mounted slot (SPA navigation remounts the slot with a fresh container, the
// old one is removed with its ad). If nothing fills within the timeout the slot collapses.
import { useEffect, useRef, useState } from "react";

const SDK_SRC = "https://cdn.fozekikikiminu.com/sdk/v1/dd.ms.js";
const SPOT = "31bf06c374434eb39d1675268d1608a5";
const DOMAIN = "fozekikikiminu.com";
const FILL_TIMEOUT_MS = 8000;

function hasAd(el: HTMLElement): boolean {
  if (el.querySelector("iframe, img, video, ins, a[href]")) return true;
  return Array.from(el.children).some(
    (c) => c.tagName !== "SCRIPT" && (c as HTMLElement).offsetHeight > 20,
  );
}

export function TsGridAd({ className = "", onEmpty }: { className?: string; onEmpty?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const injected = useRef(false);
  const [state, setState] = useState<"wait" | "filled" | "empty">("wait");
  useEffect(() => {
    const el = ref.current;
    if (!el || injected.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let mo: MutationObserver | undefined;
    const inject = () => {
      if (injected.current) return;
      injected.current = true;
      mo = new MutationObserver(() => {
        if (hasAd(el)) {
          setState("filled");
          mo?.disconnect();
        }
      });
      mo.observe(el, { childList: true, subtree: true });
      const s = document.createElement("script");
      s.src = SDK_SRC;
      s.async = true;
      s.defer = true;
      s.setAttribute("data-ts-spot", SPOT);
      s.setAttribute("data-ts-domain", DOMAIN);
      s.onerror = () => setState("empty");
      el.appendChild(s);
      timer = setTimeout(() => {
        if (!hasAd(el)) setState("empty");
      }, FILL_TIMEOUT_MS);
    };
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === "undefined") inject();
    else {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io?.disconnect();
            inject();
          }
        },
        { rootMargin: "400px 0px" },
      );
      io.observe(el);
    }
    return () => {
      io?.disconnect();
      mo?.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (state === "empty") onEmpty?.();
  }, [state, onEmpty]);

  if (state === "empty") return null;
  // One video-card footprint: until the ad arrives an invisible card-shaped placeholder (300:250
  // thumb + two title lines + stats row, like VideoCard) holds the cell, so nothing shifts; the ad
  // sits over it and takes its place once filled. Small IKLAN badge on the image.
  return (
    <div data-kdp-ad="trafficstars" className={"relative p-1 sm:p-1.5 " + className}>
      {state === "filled" ? null : (
        <div aria-hidden className="invisible">
          <div className="aspect-[300/250] w-full" />
          <div className="mt-3 min-h-[2.5em] text-[13px] leading-snug sm:text-[15px]">&nbsp;</div>
          <div className="mt-1.5 text-[11px] sm:text-xs">&nbsp;</div>
        </div>
      )}
      <div
        ref={ref}
        className={
          state === "filled" ? "relative w-full" : "absolute inset-x-1 top-1 sm:inset-x-1.5 sm:top-1.5"
        }
      />
      <span className="pointer-events-none absolute left-2.5 top-2.5 z-10 rounded bg-black/65 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-zinc-300 sm:left-3 sm:top-3">
        Iklan
      </span>
    </div>
  );
}
