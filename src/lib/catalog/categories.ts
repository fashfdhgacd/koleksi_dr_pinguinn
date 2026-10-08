import type { CategoryInfo } from "./types";

export type CategoryDef = CategoryInfo & {
  query: string;
};

export const CATEGORIES: CategoryDef[] = [
  { slug: "jav", label: "Jav", query: "jav" },
  { slug: "ai-plus", label: "AI+", query: "ai-plus" },
  { slug: "jilbab", label: "Jilbab", query: "jilbab" },
  { slug: "tante", label: "Tante", query: "tante" },
  { slug: "amatir", label: "Amatir", query: "amatir" },
  { slug: "viral", label: "Viral", query: "viral" },
  { slug: "percakapan", label: "Percakapan", query: "percakapan" },
  { slug: "kosan", label: "Kosan", query: "kosan" },
  { slug: "colmek", label: "Colmek", query: "colmek" },
  { slug: "abg", label: "Muda 18+", query: "abg" },
  { slug: "istri", label: "Istri", query: "istri" },
  { slug: "live", label: "Live", query: "live" },
  { slug: "doggy", label: "Doggy", query: "doggy" },
  { slug: "open-bo", label: "Open BO", query: "open-bo" },
  { slug: "malaysia", label: "Malaysia", query: "malaysia" },
  { slug: "chindo", label: "Chindo", query: "chindo" },
  { slug: "gangbang", label: "Threesome & Gangbang", query: "gangbang" },
  { slug: "selingkuh", label: "Selingkuh", query: "selingkuh" },
  { slug: "barat", label: "Bule", query: "barat" },
  { slug: "mahasiswi", label: "Mahasiswi", query: "mahasiswi" },
  { slug: "sepong", label: "Sepong", query: "sepong" },
  { slug: "tobrut", label: "Tobrut", query: "tobrut" },
  { slug: "selebgram", label: "Selebgram", query: "selebgram" },
  { slug: "outdoor", label: "Outdoor", query: "outdoor" },
  { slug: "hotel", label: "Hotel", query: "hotel" },
  { slug: "kamar-mandi", label: "Kamar Mandi", query: "kamar-mandi" },
  { slug: "wot", label: "Goyang WOT", query: "wot" },
  { slug: "crot-dalam", label: "Crot Dalam", query: "crot-dalam" },
  { slug: "hamil", label: "Hamil", query: "hamil" },
  { slug: "ojol", label: "Ojol", query: "ojol" },
  { slug: "hentai", label: "Hentai", query: "hentai" },
  { slug: "lainnya", label: "Lainnya", query: "lainnya" },
];

/** Kategori yang tidak dipromosikan publik (slug ber-istilah minor): keluar dari menu/sitemap, noindex. */
export const UNLISTED_CATEGORY_SLUGS = new Set<string>(["abg"]);

export const CATEGORY_LIST: CategoryInfo[] = CATEGORIES.filter((c) => !UNLISTED_CATEGORY_SLUGS.has(c.slug)).map(
  ({ slug, label }) => ({ slug, label }),
);

/** Kategori dengan video lebih sedikit dari ini tidak tampil di /kategori dan sitemap (halaman tetap bisa dibuka). */
export const MIN_LISTED_CATEGORY_COUNT = 20;

/** Chip utama di header; sisanya di menu "Lainnya". */
export const PRIMARY_CATEGORY_SLUGS = [
  "jav",
  "ai-plus",
  "jilbab",
  "tante",
  "amatir",
  "viral",
  "istri",
  "live",
] as const;

export const PRIMARY_CATEGORIES: CategoryInfo[] = PRIMARY_CATEGORY_SLUGS.map(
  (slug) => CATEGORY_LIST.find((c) => c.slug === slug)!,
).filter(Boolean);

export const MORE_CATEGORIES: CategoryInfo[] = CATEGORY_LIST.filter(
  (c) => !(PRIMARY_CATEGORY_SLUGS as readonly string[]).includes(c.slug),
);

export function findCategory(slug: string | null | undefined): CategoryDef | undefined {
  if (!slug) return undefined;
  const key = slug.trim().toLowerCase();
  if (key === "ai" || key === "ai+") {
    return CATEGORIES.find((c) => c.slug === "ai-plus");
  }
  if (key === "puterin" || key === "putarin") {
    return CATEGORIES.find((c) => c.slug === "jav");
  }
  if (key === "streamtape" || key === "streampie") {
    return CATEGORIES.find((c) => c.slug === "ai-plus");
  }
  return CATEGORIES.find((c) => c.slug === key);
}
