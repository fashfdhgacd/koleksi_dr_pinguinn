import { listSharePool } from "@/lib/catalog/local";
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
  return listSharePool({
    count: opts.count,
    category: opts.category,
    source: opts.source,
    excludeIds: opts.excludeIds,
    excludeTitles: opts.excludeTitles,
  });
}
