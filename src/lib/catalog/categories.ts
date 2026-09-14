import type { CategoryInfo } from "./types";

export type CategoryDef = CategoryInfo & {
  query: string;
};

export const CATEGORIES: CategoryDef[] = [
  { slug: "feature", label: "Film panjang", query: "collection:(feature_films)" },
  { slug: "animation", label: "Animasi", query: "collection:(animationandcartoons)" },
  { slug: "comedy", label: "Komedi", query: "subject:(comedy)" },
  { slug: "drama", label: "Drama", query: "subject:(drama)" },
  { slug: "horror", label: "Horor", query: "subject:(horror)" },
  { slug: "scifi", label: "Fiksi ilmiah", query: 'subject:("science fiction" OR sci-fi OR scifi)' },
  { slug: "action", label: "Aksi", query: "subject:(action OR adventure)" },
  { slug: "western", label: "Western", query: "subject:(western)" },
  { slug: "silent", label: "Film bisu", query: "subject:(silent)" },
  { slug: "documentary", label: "Dokumenter", query: "collection:(prelinger) OR subject:(documentary)" },
  { slug: "music", label: "Musik", query: "subject:(musical OR concert OR opera)" },
  { slug: "classic", label: "Klasik", query: "year:[1890 TO 1959]" },
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
