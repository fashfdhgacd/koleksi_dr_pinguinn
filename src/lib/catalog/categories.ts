import type { CategoryInfo } from "./types";

export type CategoryDef = CategoryInfo & {
  query: string;
};

export const CATEGORIES: CategoryDef[] = [
  { slug: "jilbab", label: "Jilbab", query: "jilbab" },
  { slug: "tante", label: "Tante / Janda", query: "tante" },
  { slug: "amatir", label: "Amatir", query: "amatir" },
  { slug: "viral", label: "Viral", query: "viral" },
  { slug: "percakapan", label: "Percakapan", query: "percakapan" },
  { slug: "kosan", label: "Pacar / Kosan", query: "kosan" },
  { slug: "colmek", label: "Colmek", query: "colmek" },
  { slug: "abg", label: "ABG", query: "abg" },
  { slug: "istri", label: "Istri / Selingkuh", query: "istri" },
  { slug: "live", label: "Live", query: "live" },
  { slug: "doggy", label: "Doggy", query: "doggy" },
  { slug: "open-bo", label: "Open BO", query: "open-bo" },
  { slug: "malaysia", label: "Malaysia", query: "malaysia" },
  { slug: "chindo", label: "Chindo", query: "chindo" },
  { slug: "gangbang", label: "Gangbang", query: "gangbang" },
  { slug: "lainnya", label: "Lainnya", query: "lainnya" },
];

export const CATEGORY_LIST: CategoryInfo[] = CATEGORIES.map(({ slug, label }) => ({
  slug,
  label,
}));

export function findCategory(slug: string | null | undefined): CategoryDef | undefined {
  if (!slug) return undefined;
  const key = slug.trim().toLowerCase();
  return CATEGORIES.find((c) => c.slug === key);
}
