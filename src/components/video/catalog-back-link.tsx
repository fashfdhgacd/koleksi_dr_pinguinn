import { useEffect, useState } from "react";
import { backToCatalog, lastCatalogHref } from "@/lib/catalog/last-catalog";
import { findCategory } from "@/lib/catalog/categories";
import type { VideoDetail } from "@/lib/catalog/types";

function fallbackHref(item: VideoDetail): string {
  const raw = String(item.category || item.creator || "").trim().toLowerCase();
  if (/jav|putarin|puterin/.test(raw)) return "/kategori/jav";
  if (/ai\+|ai-plus|streamtape/.test(raw)) return "/kategori/ai-plus";
  const cat = findCategory(raw.replace(/\s+/g, "-")) || findCategory(raw);
  return cat?.slug ? `/kategori/${cat.slug}` : "/";
}

export function CatalogBackLink({ item }: { item: VideoDetail }) {
  const fallback = fallbackHref(item);
  const [href, setHref] = useState(fallback);

  useEffect(() => {
    setHref(lastCatalogHref(fallback));
  }, [fallback]);

  return (
    <a
      href={href}
      onClick={(e) => {
        // Same grid page, same scroll: history back when the grid is the previous entry, else a
        // normal load of href that restores the saved scroll position.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (backToCatalog(href)) e.preventDefault();
      }}
      className="flex h-12 items-center rounded-xl bg-secondary px-5 text-base text-foreground">
      Kembali ke katalog
    </a>
  );
}
