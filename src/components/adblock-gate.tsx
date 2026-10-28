// Ad-blocker gate for Videy watch pages only (watch-page.tsx wraps VideyPlayer with it). Every other
// host (IndoAV, UserBokep, Putarin/Jav, Streamtape, ...) and every catalog page is never gated.
// player.tsx and the iframe URLs stay as they are.
// Detection, once per page load, client only, no polling:
//  1. a bait element with ad-like class names; blockers' cosmetic filters hide it (height 0 /
//     display none);
//  2. a no-cors request to the ExoClick ad script we already load on grid cards
//     (a.magsrv.com/ad-provider.js). A blocker rejects it at once; a slow network does not reject.
// Network rule against false positives: a rejected ad request only counts when the browser is
// online and a same-origin control request (/robots.txt) succeeds, and anything that is still
// pending after DETECT_TIMEOUT_MS is treated as "not blocked". The single setTimeout is the
// one-off detection timeout only.
// Events go to /api/ad-log (existing D1 counters, host VideyAd): ad:adblock (detected) and
// ad:gate_pass (visitor reloaded with the blocker off), each at most once per page view.
import { useEffect, useState, type ReactNode } from "react";

const AD_SCRIPT = "https://a.magsrv.com/ad-provider.js";
const DETECT_TIMEOUT_MS = 4000;
const FLAG = "kdp_adblock_seen";

type Verdict = "checking" | "ok" | "blocked";

function beacon(id: string, event: "adblock" | "gate_pass"): void {
  try {
    const body = JSON.stringify({ id, event });
    if (!navigator.sendBeacon?.("/api/ad-log", body)) {
      void fetch("/api/ad-log", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* logging never breaks the page */
  }
}

function baitHidden(): boolean {
  const el = document.createElement("div");
  el.className = "adsbox ad-banner ads pub_300x250 text-ad adsbygoogle";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;";
  el.innerHTML = "&nbsp;";
  document.body.appendChild(el);
  const cs = window.getComputedStyle(el);
  const hidden = el.offsetHeight === 0 || el.offsetParent === null || cs.display === "none" || cs.visibility === "hidden";
  el.remove();
  return hidden;
}

/** Resolves true only when the ad request was rejected while the network clearly works. */
function scriptBlocked(): Promise<boolean> {
  if (!navigator.onLine) return Promise.resolve(false);
  const ad = fetch(AD_SCRIPT, { mode: "no-cors", cache: "no-store", credentials: "omit" }).then(
    () => true,
    () => false,
  );
  const control = fetch("/robots.txt", { method: "HEAD", cache: "no-store" }).then(
    (r) => r.ok,
    () => false,
  );
  return Promise.all([ad, control]).then(([adOk, controlOk]) => !adOk && controlOk);
}

export function detectAdblock(): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(tid);
      resolve(v);
    };
    const tid = window.setTimeout(() => finish(false), DETECT_TIMEOUT_MS);
    // Let cosmetic filters apply to the bait before measuring.
    requestAnimationFrame(() => {
      if (baitHidden()) {
        finish(true);
        return;
      }
      scriptBlocked().then(finish, () => finish(false));
    });
  });
}

export function AdblockGate({ videoId, children }: { videoId: string; children: ReactNode }) {
  const [verdict, setVerdict] = useState<Verdict>("checking");

  useEffect(() => {
    let alive = true;
    detectAdblock().then((blocked) => {
      if (!alive) return;
      let seen = false;
      try {
        seen = sessionStorage.getItem(FLAG) === "1";
        if (blocked) sessionStorage.setItem(FLAG, "1");
        else if (seen) sessionStorage.removeItem(FLAG);
      } catch {
        /* storage off: no gate_pass event */
      }
      if (blocked) beacon(videoId, "adblock");
      else if (seen) beacon(videoId, "gate_pass");
      setVerdict(blocked ? "blocked" : "ok");
    });
    return () => {
      alive = false;
    };
  }, [videoId]);

  return (
    <div className="relative">
      {children}
      {verdict === "blocked" ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="kdp-adblock-title"
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 p-4 text-center text-white sm:rounded-xl"
        >
          <div className="max-w-sm space-y-3">
            <p id="kdp-adblock-title" className="text-base font-semibold sm:text-lg">
              Matikan pemblokir iklan dulu ya
            </p>
            <p className="text-sm text-white/80">
              Koleksi Dr. Pinguin gratis karena iklan. Matikan AdBlock atau mode pemblokir iklan di browser
              kamu untuk situs ini, lalu muat ulang halaman supaya video bisa diputar.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Sudah, muat ulang
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
