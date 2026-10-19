// TrafficStars MasterSpot 300x250 (spot 5210857) as one card in catalog grids (home, kategori).
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
  // Sizes to the rendered ad (no fixed frame, nothing clipped). Space for a 300x250 is reserved up
  // front (min-height) so the grid does not jump when the ad arrives; full cell width on mobile.
  return (
    <div data-kdp-ad="trafficstars" className={"p-1 sm:p-1.5 " + className}>
      <div className="flex min-h-[250px] w-full items-center justify-center">
        <div ref={ref} className="w-full max-w-full" />
      </div>
      <p className="mt-2 text-[11px] uppercase tracking-wide text-zinc-500">Iklan</p>
    </div>
  );
}
