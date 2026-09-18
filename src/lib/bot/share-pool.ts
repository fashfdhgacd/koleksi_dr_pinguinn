import { listCategory, listLatest } from "@/lib/catalog/local";
import type { VideoCard } from "@/lib/catalog/types";

export function titleKey(t: string): string {
  return String(t || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function collectSharePool(opts: {
  count: number;
  category: string;
  source: string;
  excludeIds: string[];
  excludeTitles?: string[];
}): Promise<{ items: VideoCard[]; poolSize: number; freshSize: number; reset: boolean }> {
  const all: VideoCard[] = [];
  const seen = new Set<string>();
  const seenTitle = new Set<string>();
  const maxPages = 120;
  for (let p = 1; p <= maxPages; p++) {
    const page = opts.category
      ? await listCategory(opts.category, p, 48)
      : await listLatest(p, 48);
    for (const it of page.items) {
      if (!it?.id || seen.has(it.id)) continue;
      const tk = titleKey(it.title || "");
      if (tk && seenTitle.has(tk)) continue;
      if (opts.source) {
        const blob = `${it.creator || ""} ${it.quality || ""} ${it.title || ""}`.toLowerCase();
        if (opts.source === "streamtape" && !/streamtape|strcloud|\bstream\b/.test(blob)) continue;
        if (opts.source === "putarin" && !/putarin|puterin|jav/.test(blob)) continue;
        if (opts.source === "lulu" && !/lulu/.test(blob)) continue;
      }
      seen.add(it.id);
      if (tk) seenTitle.add(tk);
      all.push(it);
    }
    if (!page.hasMore) break;
  }

  const excludeIds = new Set(opts.excludeIds.map((s) => s.toLowerCase()));
  const excludeTitles = new Set((opts.excludeTitles || []).map(titleKey));
  let fresh = all.filter((it) => {
    if (excludeIds.has(it.id.toLowerCase())) return false;
    const tk = titleKey(it.title || "");
    if (tk && excludeTitles.has(tk)) return false;
    return true;
  });
  let reset = false;
  if (fresh.length < opts.count && all.length >= opts.count) {
    fresh = all.slice();
    reset = true;
  }
  for (let i = fresh.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = fresh[i];
    fresh[i] = fresh[j];
    fresh[j] = tmp;
  }
  return {
    items: fresh.slice(0, opts.count),
    poolSize: all.length,
    freshSize: fresh.length,
    reset,
  };
}
