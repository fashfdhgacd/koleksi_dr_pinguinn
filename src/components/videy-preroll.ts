// TrafficStars VAST pre-roll for the Videy player (videy-player.tsx), spot 5210886 (mobile only).
// Client-side only: the browser fetches the VAST tag straight from TrafficStars (nothing passes
// through our Worker), follows up to 3 wrapper hops, and picks an mp4 MediaFile. Any failure
// (no fill, network/CORS error, bad XML, 3.5 s timeout) resolves to null so the film plays.
// Frequency: about every 2nd Videy play, counted in localStorage (no server writes).

const VAST_TAG = "https://fozekikikiminu.com/do2/4c0a6f5c2b43423e95511f7b40ddf60f/vast?";
const MAX_WRAPPERS = 3;
export const VAST_TIMEOUT_MS = 3500;
const COUNT_KEY = "kdp_videy_preroll_n";

export type VastAd = {
  media: string;
  clickThrough: string | null;
  /** Seconds after which the VAST allows skipping; null when the ad has no skipoffset. */
  skipOffset: number | null;
  impression: string[];
  error: string[];
  clickTracking: string[];
  events: Record<string, string[]>;
};

/** Counts this Videy play and says whether it gets a pre-roll (1st, 3rd, 5th ... play). */
export function prerollDue(): boolean {
  if (typeof window === "undefined") return false;
  let n = 0;
  try {
    n = Number(window.localStorage.getItem(COUNT_KEY)) || 0;
    window.localStorage.setItem(COUNT_KEY, String((n + 1) % 1000));
  } catch {
    return Math.random() < 0.5;
  }
  return n % 2 === 0;
}

function text(el: Element | null | undefined): string {
  return (el?.textContent || "").trim();
}

function texts(root: Element, selector: string): string[] {
  return Array.from(root.querySelectorAll(selector))
    .map((e) => text(e))
    .filter((u) => /^https?:\/\//i.test(u));
}

function parseOffset(raw: string | null, duration: number): number | null {
  if (!raw) return null;
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(raw.trim());
  if (pct) return duration > 0 ? (Number(pct[1]) / 100) * duration : null;
  const m = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(raw.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function emptyAd(): VastAd {
  return { media: "", clickThrough: null, skipOffset: null, impression: [], error: [], clickTracking: [], events: {} };
}

/** Merges one VAST document's tracking into acc; returns the wrapper's next tag URL, if any. */
function absorb(doc: Document, acc: VastAd): { next: string | null; done: boolean } {
  const ad = doc.querySelector("VAST > Ad");
  if (!ad) return { next: null, done: false };
  acc.impression.push(...texts(ad, "Impression"));
  acc.error.push(...texts(ad, "Error"));
  const linear = ad.querySelector("Creative Linear");
  if (linear) {
    for (const t of Array.from(linear.querySelectorAll("TrackingEvents > Tracking"))) {
      const ev = t.getAttribute("event") || "";
      const url = text(t);
      if (ev && /^https?:\/\//i.test(url)) (acc.events[ev] ||= []).push(url);
    }
    acc.clickTracking.push(...texts(linear, "VideoClicks > ClickTracking"));
  }
  const wrapper = ad.querySelector("Wrapper");
  if (wrapper) return { next: text(wrapper.querySelector("VASTAdTagURI")) || null, done: false };
  if (!linear) return { next: null, done: false };
  const files = Array.from(linear.querySelectorAll("MediaFiles > MediaFile"))
    .filter((f) => /mp4/i.test(f.getAttribute("type") || "") || /\.mp4(\?|$)/i.test(text(f)))
    .filter((f) => /^https:\/\//i.test(text(f)));
  if (!files.length) return { next: null, done: false };
  // Mobile: the smallest file that is at least 360 px tall, else the largest available.
  const h = (f: Element) => Number(f.getAttribute("height")) || 0;
  files.sort((a, b) => h(a) - h(b));
  const pick = files.find((f) => h(f) >= 360) || files[files.length - 1];
  acc.media = text(pick);
  const dur = parseOffset(text(linear.querySelector("Duration")), 0) || 0;
  acc.skipOffset = parseOffset(linear.getAttribute("skipoffset"), dur);
  const ct = text(linear.querySelector("VideoClicks > ClickThrough"));
  acc.clickThrough = /^https?:\/\//i.test(ct) ? ct : null;
  return { next: null, done: true };
}

/** Fetches and resolves the pre-roll; null on no fill / error / timeout (never throws). */
export async function loadVast(signal: AbortSignal): Promise<{ ad: VastAd | null; reason: "fill" | "empty" | "error" | "timeout" }> {
  const acc = emptyAd();
  let url: string | null = VAST_TAG;
  try {
    for (let hop = 0; url && hop <= MAX_WRAPPERS; hop++) {
      const res: Response = await fetch(url, { signal, credentials: "omit", cache: "no-store" });
      if (!res.ok) return { ad: null, reason: hop === 0 && res.status === 404 ? "empty" : "error" };
      const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
      if (doc.querySelector("parsererror")) return { ad: null, reason: "error" };
      const r = absorb(doc, acc);
      if (r.done) return { ad: acc, reason: "fill" };
      url = r.next;
    }
    if (acc.error.length) ping(acc.error.map((u) => u.replace(/\[ERRORCODE\]/gi, "303")));
    return { ad: null, reason: "empty" };
  } catch (err) {
    const aborted = signal.aborted || (err instanceof DOMException && err.name === "AbortError");
    return { ad: null, reason: aborted ? "timeout" : "error" };
  }
}

/** Fire-and-forget tracking pixels ([CACHEBUSTING] / [TIMESTAMP] macros filled). */
export function ping(urls: string[] | undefined): void {
  if (!urls?.length || typeof window === "undefined") return;
  const cb = String(Math.floor(Math.random() * 1e8));
  for (const u of urls) {
    const src = u.replace(/\[CACHEBUSTING\]/gi, cb).replace(/\[TIMESTAMP\]/gi, encodeURIComponent(new Date().toISOString()));
    try {
      const img = new Image();
      img.referrerPolicy = "no-referrer-when-downgrade";
      img.src = src;
    } catch {
      /* ignore */
    }
  }
}
