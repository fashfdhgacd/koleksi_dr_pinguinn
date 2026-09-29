const warm = new Set<string>();
const LS = "dp_poster_warm_v2";

function store() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hydrate() {
  if (warm.size) return;
  const ls = typeof window === "undefined" ? null : store();
  if (!ls) return;
  try {
    const raw = ls.getItem(LS);
    if (!raw) return;
    const list = JSON.parse(raw) as string[];
    if (Array.isArray(list)) for (const u of list.slice(-800)) if (typeof u === "string") warm.add(u);
  } catch {
    /* ignore */
  }
}

function persist() {
  const ls = typeof window === "undefined" ? null : store();
  if (!ls) return;
  try {
    ls.setItem(LS, JSON.stringify([...warm].slice(-800)));
  } catch {
    /* quota */
  }
}

if (typeof window !== "undefined") hydrate();

export function isPosterWarm(src?: string | null): boolean {
  return Boolean(src && warm.has(src));
}

export function markPosterWarm(src?: string | null): void {
  if (!src || src.startsWith("data:") || /brand-poster/i.test(src)) return;
  if (warm.has(src)) return;
  warm.add(src);
  persist();
}
