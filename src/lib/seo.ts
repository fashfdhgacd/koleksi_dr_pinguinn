import { findCategory } from "@/lib/catalog/categories";

export const SITE_ORIGIN = "https://koleksidrpinguin.com";
export const SITE_NAME = "Dr. Pinguin";
export const DEFAULT_OG = `${SITE_ORIGIN}/og.jpg`;

const HOME_DESCRIPTION =
  "Nonton bokep Indo terbaru di Dr. Pinguin. Koleksi amatir, jilbab, tante, viral, dan percakapan. Konten 18+.";

export function categoryKeywords(slugOrLabel?: string | null): string {
  const key = (slugOrLabel || "").trim().toLowerCase();
  const cat = findCategory(key) || findCategory(key.replace(/\s+/g, "-"));
  const label = cat?.label || slugOrLabel || "Indo";
  return `bokep indo, bokep ${label.toLowerCase()}, ${label.toLowerCase()} viral, video dewasa indo, dr pinguin`;
}

export function pageTitle(parts: Array<string | null | undefined>): string {
  const clean = parts.map((p) => (p || "").trim()).filter(Boolean);
  const unique = clean.filter((p, i) => clean.findIndex((x) => x.toLowerCase() === p.toLowerCase()) === i);
  if (!unique.length) return `${SITE_NAME} — Bokep Indo`;
  if (unique[unique.length - 1]?.toLowerCase() === SITE_NAME.toLowerCase()) {
    return unique.join(" | ");
  }
  return `${unique.join(" | ")} | ${SITE_NAME}`;
}

export function videoSeoTitle(title: string, category?: string | null): string {
  const cat = (category || "Indo").trim();
  const base = title.trim() || "Video Bokep Indo";
  const withCat = new RegExp(cat, "i").test(base) ? base : `${base} — Bokep Indo ${cat}`;
  return pageTitle([withCat]);
}

export function videoSeoDescription(title: string, category?: string | null): string {
  const cat = (category || "Indo").trim();
  const t = title.trim() || "video bokep Indo";
  return `Nonton ${t} bokep Indo ${cat} full di ${SITE_NAME}. Streaming amatir, jilbab, tante, dan viral. Konten 18+.`.slice(
    0,
    160,
  );
}

export function homeSeo(q?: string, category?: string) {
  if (q) {
    return {
      title: pageTitle([`Cari “${q}”`, "Bokep Indo"]),
      description: `Hasil pencarian “${q}” di koleksi bokep Indo ${SITE_NAME}. Konten 18+.`,
      keywords: `${q}, bokep indo, ${q} viral, dr pinguin`,
    };
  }
  const cat = findCategory(category);
  if (cat) {
    return {
      title: pageTitle([`Bokep Indo ${cat.label}`, cat.label]),
      description: `Kumpulan bokep Indo ${cat.label.toLowerCase()} terbaru di ${SITE_NAME}. Streaming gratis, update setiap hari. Konten 18+.`,
      keywords: categoryKeywords(cat.slug),
    };
  }
  return {
    title: pageTitle(["Bokep Indo Terbaru"]),
    description: HOME_DESCRIPTION,
    keywords: "bokep indo, bokep indo terbaru, bokep viral, bokep jilbab, bokep tante, dr pinguin",
  };
}

export function videoJsonLd(input: {
  id: string;
  title: string;
  description: string;
  thumbnail?: string | null;
  category?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: input.title,
    description: input.description,
    thumbnailUrl: input.thumbnail && input.thumbnail.startsWith("http") ? input.thumbnail : DEFAULT_OG,
    uploadDate: "2026-01-01",
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_ORIGIN },
    genre: input.category || "Adult",
    isFamilyFriendly: "false",
    url: `${SITE_ORIGIN}/watch/${input.id}`,
  };
}
