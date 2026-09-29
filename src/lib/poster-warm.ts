const warm = new Set<string>();
const SS = "dp_poster_warm_v1";

function hydrate() {
  if (typeof sessionStorage === "undefined" || warm.size) return;
  try {
    const raw = sessionStorage.getItem(SS);
    if (!raw) return;
    const list = JSON.parse(raw) as string[];
    if (Array.isArray(list)) for (const u of list.slice(-400)) if (typeof u === "string") warm.add(u);
  } catch {
    /* ignore */
  }
}

function persist() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SS, JSON.stringify([...warm].slice(-400)));
  } catch {
    /* quota */
  }
}

hydrate();

export function isPosterWarm(src?: string | null): boolean {
  return Boolean(src && warm.has(src));
}

export function markPosterWarm(src?: string | null): void {
  if (!src || src.startsWith("data:") || /brand-poster/i.test(src)) return;
  if (warm.has(src)) return;
  warm.add(src);
  persist();
  if (typeof document === "undefined") return;
  const img = new Image();
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.src = src;
}
