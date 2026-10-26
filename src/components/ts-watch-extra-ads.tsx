// TrafficStars In-Page Push (spot 5211537) on watch pages. The Video Slider (spot 5211538) was removed
// 26 Okt 2026: $0.04 from 1,452 impressions at 4.7% CTR (likely accidental taps near the player).
// Applies to watch pages
// whose video source carries no ads of ours and no host bonus we must protect.
// Excluded: Videy (own preroll + popunder), Byse / LuluStream / DoodStream owner uploads (Byse panel
// VAST + popunder, lulu-pop.js), IndoAV (host ads + IndoAV bonus). Everything else (UserBokep,
// Putarin/Jav, Streamtape, ...) gets them.
// Client-side only, lazy: SDKs load after the first interaction or 6 s, once per full page load
// (both SDKs are global and keep their own frequency cookies). No storage writes, no polling.
import { useEffect } from "react";

const SDK_HOST = "https://cdn.fozekikikiminu.com/sdk/v1/";
const INPAGE_PUSH_SPOT = "f532e86d503d497eb8263a5eecf81c82";
const LAZY_MS = 6000;

type TsWindow = Window & {
  __kdpWatchExtraAds?: boolean;
  TsInPagePush?: (opts: Record<string, unknown>) => void;
  TSVideoInstantMessage?: (opts: Record<string, unknown>) => void;
};

function loadSdk(file: string, onLoad: () => void) {
  const s = document.createElement("script");
  s.src = SDK_HOST + file;
  s.async = true;
  s.onload = onLoad;
  document.body.appendChild(s);
}

function start() {
  const w = window as TsWindow;
  if (w.__kdpWatchExtraAds) return;
  w.__kdpWatchExtraAds = true;
  loadSdk("inpage.push.js", () => {
    try {
      w.TsInPagePush?.({ spot: INPAGE_PUSH_SPOT, verticalPosition: "top" });
    } catch {
      /* ad error never breaks the page */
    }
  });
}

export function TsWatchExtraAds({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if ((window as TsWindow).__kdpWatchExtraAds) return;
    let done = false;
    const opts: AddEventListenerOptions = { passive: true, once: true };
    const fire = () => {
      if (done) return;
      done = true;
      cleanup();
      start();
    };
    const tid = window.setTimeout(fire, LAZY_MS);
    function cleanup() {
      window.clearTimeout(tid);
      window.removeEventListener("pointerdown", fire);
      window.removeEventListener("scroll", fire);
      window.removeEventListener("keydown", fire);
    }
    window.addEventListener("pointerdown", fire, opts);
    window.addEventListener("scroll", fire, opts);
    window.addEventListener("keydown", fire, opts);
    return cleanup;
  }, [enabled]);
  return null;
}
