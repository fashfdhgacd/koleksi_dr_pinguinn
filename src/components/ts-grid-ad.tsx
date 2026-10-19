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
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // A fixed-size banner (iframe) narrower cell: shrink it to fit (never crop). Natives are fluid.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const hasBanner = Boolean(box.querySelector("iframe"));
      const w = box.clientWidth;
      setScale(hasBanner && w > 0 && w < 300 ? w / 300 : 1);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [state]);
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
  // One video-card footprint, reserved from the first paint (no CLS): a dark frame tall enough for
  // the native unit (300:250 image at up to 300 px wide + its text) with the ad centered at its real size (a 300x250 banner only shrinks, never crops, when a
  // cell is narrower than 300 px; a native unit flows to the width), then a text row with IKLAN.
  // The frame grows with taller content instead of clipping it.
  return (
    <div data-kdp-ad="trafficstars" className={"p-1 [container-type:inline-size] sm:p-1.5 " + className}>
      <div
        ref={boxRef}
        className="flex min-h-[calc(min(300px,100cqw)*0.8334+76px)] w-full items-center justify-center rounded-xl bg-[#131316]"
      >
        <div
          ref={ref}
          className="w-full max-w-[300px]"
          style={scale < 1 ? { zoom: scale } : undefined}
        />
      </div>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Iklan</p>
    </div>
  );
}
