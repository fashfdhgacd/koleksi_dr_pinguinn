import { useEffect } from "react";

/**
 * ExoClick popunder (zone 6055468), only on Videy watch pages.
 * - Script (ExoClick hosted loader) is injected on client mount of a Videy page, never on SSR.
 * - Gate lives in ad_should_fire: fires only while a Videy watch page is mounted,
 *   only on a real user click, not on the pre-roll ad/skip button, max once per 5 minutes.
 * - SPA navigation away flips the gate off, so other pages never open a tab.
 */
const ZONE = 6055468;
const SRC = "https://a.pemsrv.com/popunder1000.js";
const CAP_MS = 5 * 60 * 1000;
const LS_KEY = "kdp:vpop:last";

type PopWin = Window & {
  __kdpVpopOn?: boolean;
  __kdpVpopLoaded?: boolean;
  __kdpVpopTarget?: Element | null;
  [k: string]: unknown;
};

function lastOpen(): number {
  try {
    return Number(localStorage.getItem(LS_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function markOpen(now: number) {
  try {
    localStorage.setItem(LS_KEY, String(now));
  } catch {
    /* ignore */
  }
}

function isAdClick(el: Element | null | undefined): boolean {
  if (!el || typeof el.closest !== "function") return false;
  if (el.closest('[aria-label="Iklan"],[data-kdp-noad]')) return true;
  const btn = el.closest("button");
  return Boolean(btn && /lewati|skip/i.test(btn.textContent || ""));
}

export function VideyPopunder() {
  useEffect(() => {
    const w = window as unknown as PopWin;
    w.__kdpVpopOn = true;

    const onDown = (e: Event) => {
      w.__kdpVpopTarget = e.isTrusted ? (e.target as Element | null) : null;
    };
    document.addEventListener("pointerdown", onDown, true);

    if (!w.__kdpVpopLoaded) {
      w.__kdpVpopLoaded = true;
      w.ad_idzone = String(ZONE);
      w.ad_frequency_period = 5;
      w.ad_frequency_count = 1;
      w.ad_trigger_method = 1;
      w.ad_trigger_delay = 0;
      w.ad_popup_fallback = false;
      w.ad_popup_force = false;
      w.ad_chrome_enabled = true;
      w.ad_new_tab = false;
      w.ad_capping_enabled = false; // own cap below; the loader ignores should_fire when its cap is on
      w.ad_should_fire = () => {
        if (!w.__kdpVpopOn) return false;
        const t = w.__kdpVpopTarget;
        w.__kdpVpopTarget = null;
        if (!t || isAdClick(t)) return false;
        const now = Date.now();
        if (now - lastOpen() < CAP_MS) return false;
        markOpen(now);
        return true;
      };
      const s = document.createElement("script");
      s.async = true;
      s.src = SRC;
      s.setAttribute("data-kdp", "videy-popunder");
      document.body.appendChild(s);
    }

    return () => {
      w.__kdpVpopOn = false;
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, []);
  return null;
}
