// Wynq responsive 1:1 display zone as one grid card. The site tag (rapidfire.cc, loaded in <head> by
// __root.tsx) renders every <div data-bpid>. The div is added once, client-side, only when the slot
// first nears the viewport (a slot hidden for the other breakpoint never gets one, so a bpid is never
// on the page twice). Reserved 300x250 frame (no layout shift); if nothing with height > 20px appears
// within 8s onEmpty fires (GridAd swaps once to an ExoClick fallback zone; without one the frame stays).
// No refresh / rotation.
import { useEffect, useRef, useState } from "react";
import { AdCardShell, FILL_TIMEOUT_MS, onceNearViewport, useFitScale, useReportEmpty } from "@/components/grid-cell";

function filled(el: HTMLElement): boolean {
  const slot = el.querySelector("[data-bpid]");
  if (!slot) return false;
  return Array.from(slot.querySelectorAll("*")).some((c) => (c as HTMLElement).offsetHeight > 20);
}

export function WynqGridAd({ zoneId, className = "", onEmpty }: { zoneId: string; className?: string; onEmpty?: () => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const [empty, setEmpty] = useState(false);
  const scale = useFitScale(frameRef);
  useReportEmpty(empty, onEmpty);

  useEffect(() => {
    const frame = frameRef.current;
    const el = innerRef.current;
    if (!frame || !el || !zoneId || placed.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = onceNearViewport(frame, () => {
      if (placed.current || !frame.clientWidth) return;
      placed.current = true;
      if (!el.querySelector("[data-bpid]")) {
        const div = document.createElement("div");
        div.dataset.bpid = zoneId;
        div.style.width = "300px";
        div.style.height = "250px";
        el.appendChild(div);
      }
      timer = setTimeout(() => {
        if (!filled(el)) setEmpty(true);
      }, FILL_TIMEOUT_MS);
    });
    return () => {
      stop();
      if (timer) clearTimeout(timer);
    };
  }, [zoneId]);

  return <AdCardShell network="wynq" className={className} frameRef={frameRef} innerRef={innerRef} scale={scale} />;
}
