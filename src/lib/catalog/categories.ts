import type { CategoryInfo } from "./types";

export type CategoryDef = CategoryInfo & {
  query: string;
};

export const CATEGORIES: CategoryDef[] = [
  { slug: "jav", label: "Jav", query: "jav" },
  { slug: "hentai", label: "Hentai", query: "hentai" },
  { slug: "ai-plus", label: "AI+", query: "ai-plus" },
  // Gay AI videos; tagged on upload with #aigay or "kategori: ai gay" (src/lib/bot/parse.js).
  { slug: "ai-gay", label: "AI GAY", query: "ai-gay" },
  { slug: "jilbab", label: "Jilbab", query: "jilbab" },
  { slug: "tante", label: "Tante", query: "tante" },
  { slug: "amatir", label: "Amatir", query: "amatir" },
  { slug: "viral", label: "Viral", query: "viral" },
  { slug: "percakapan", label: "Percakapan", query: "percakapan" },
  { slug: "kosan", label: "Kosan", query: "kosan" },
  { slug: "colmek", label: "Colmek", query: "colmek" },
  { slug: "teen-18", label: "Teen (18+)", query: "teen-18" },
  { slug: "istri", label: "Istri", query: "istri" },
  { slug: "live", label: "Live", query: "live" },
  { slug: "doggy", label: "Doggy", query: "doggy" },
  { slug: "open-bo", label: "Open BO", query: "open-bo" },
  { slug: "malaysia", label: "Malaysia", query: "malaysia" },
  { slug: "chindo", label: "Chindo", query: "chindo" },
  { slug: "gangbang", label: "Threesome & Gangbang", query: "gangbang" },
  { slug: "selingkuh", label: "Selingkuh", query: "selingkuh" },
  { slug: "barat", label: "Bule", query: "barat" },
  { slug: "college-18", label: "College (18+)", query: "college-18" },
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
  { slug: "blunder", label: "Blunder", query: "blunder" },
  { slug: "kelas-bintang", label: "Kelas Bintang", query: "kelas-bintang" },
  { slug: "tiktok", label: "TikTok", query: "tiktok" },
  { slug: "mantan", label: "Mantan", query: "mantan" },
  { slug: "vcs", label: "VCS", query: "vcs" },
  { slug: "kompilasi", label: "Kompilasi", query: "kompilasi" },
  { slug: "tetangga", label: "Tetangga", query: "tetangga" },
  { slug: "kacamata", label: "Kacamata", query: "kacamata" },
  { slug: "kantor", label: "Kantor", query: "kantor" },
  { slug: "anal", label: "Anal", query: "anal" },
  { slug: "cantik", label: "Cewek Cantik", query: "cantik" },
  { slug: "lainnya", label: "Lainnya", query: "lainnya" },
  { slug: "videy", label: "drpinguin videy", query: "videy" },
  // Owner's own LuluStream / DoodStream / Byse uploads (src/lib/catalog/drp-hosts.js).
  { slug: "bokep", label: "Koleksi Dr. Pinguin Bokep", query: "bokep" },
];

/** Kategori yang tidak dipromosikan publik: keluar dari menu/sitemap, noindex. (Kosong sejak abg -> teen-18.) */
export const UNLISTED_CATEGORY_SLUGS = new Set<string>([]);

/**
 * Old category slugs (big-tube rename 2026-10-20, owner decision): /kategori/<old> answers 301 to the
 * new slug, and every stored / bot / source value with the old name still lands in the new category.
 * The title classifier keeps its internal keys "abg" / "mahasiswi"; slugOf() maps them here.
 */
export const LEGACY_CATEGORY_SLUGS: Record<string, string> = { abg: "teen-18", mahasiswi: "college-18" };

export const CATEGORY_LIST: CategoryInfo[] = CATEGORIES.filter((c) => !UNLISTED_CATEGORY_SLUGS.has(c.slug)).map(
  ({ slug, label }) => ({ slug, label }),
);

/** Kategori dengan video lebih sedikit dari ini tidak tampil di /kategori dan sitemap (halaman tetap bisa dibuka). */
export const MIN_LISTED_CATEGORY_COUNT = 20;

/** A category page with fewer videos than this is noindex,follow (thin page), indexable automatically after. */
export const MIN_INDEXED_CATEGORY_COUNT = 5;

/**
 * SEO categories added 2026-10-26 (from Search Console queries + title word counts). Each is listed
 * on /kategori, in the sitemap and on watch chips only from its count (AI GAY: always on /kategori);
 * below it the page is noindex,follow. Members come from title rules (additive, title-tags.ts) or
 * an explicit upload category; a live video's main category never changes.
 */
export const SEO_MIN_COUNT: Record<string, number> = {
  "ai-gay": MIN_INDEXED_CATEGORY_COUNT,
  "blunder": 8,
  "kelas-bintang": 8,
  "tiktok": 8,
  "mantan": 8,
  "vcs": 8,
  "kompilasi": 8,
  "tetangga": 8,
  "kacamata": 8,
  "kantor": 8,
  "anal": 8,
  "cantik": 8,
};

/** Fewest videos for a category page to be indexable (1 = any non-empty page). */
export function minIndexedCount(slug: string | null | undefined): number {
  return (slug && SEO_MIN_COUNT[slug]) || 1;
}

/** Upload hashtags (#aigay, #kelasbintang, ...) per category slug; see src/lib/bot/parse.js. */
export const HASHTAG_CATEGORY: Record<string, string> = {
  aigay: "ai-gay",
  "blunder": "blunder",
  "kelasbintang": "kelas-bintang",
  "tiktok": "tiktok",
  "mantan": "mantan",
  "vcs": "vcs",
  "kompilasi": "kompilasi",
  "tetangga": "tetangga",
  "kacamata": "kacamata",
  "kantor": "kantor",
  "anal": "anal",
  "cantik": "cantik",
};

/** Chip utama di header; sisanya di menu "Lainnya". */
export const PRIMARY_CATEGORY_SLUGS = [
  "jav",
  "hentai",
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

/** Every spelling that names AI GAY (upload "kategori:" line, #aigay tag, bot menu). */
export const AI_GAY_KEYS = new Set(["ai-gay", "ai gay", "aigay", "#aigay", "#ai-gay", "ai_gay"]);

export function findCategory(slug: string | null | undefined): CategoryDef | undefined {
  if (!slug) return undefined;
  const key = slug.trim().toLowerCase();
  if (AI_GAY_KEYS.has(key)) return CATEGORIES.find((c) => c.slug === "ai-gay");
  if (key === "ai" || key === "ai+") {
    return CATEGORIES.find((c) => c.slug === "ai-plus");
  }
  if (key === "anime" || key === "animasi") {
    return CATEGORIES.find((c) => c.slug === "hentai");
  }
  if (key === "puterin" || key === "putarin") {
    return CATEGORIES.find((c) => c.slug === "jav");
  }
  if (key === "streamtape" || key === "streampie") {
    return CATEGORIES.find((c) => c.slug === "ai-plus");
  }
  const tag = HASHTAG_CATEGORY[key.replace(/^#/, "").replace(/[-_ ]/g, "")];
  if (tag) return CATEGORIES.find((c) => c.slug === tag);
  const legacy = LEGACY_CATEGORY_SLUGS[key];
  if (legacy) return CATEGORIES.find((c) => c.slug === legacy);
  return CATEGORIES.find((c) => c.slug === key);
}
