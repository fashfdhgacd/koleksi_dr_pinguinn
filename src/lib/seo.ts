import { findCategory } from "@/lib/catalog/categories";

export const SITE_ORIGIN = "https://koleksidrpinguin.com";
export const SITE_NAME = "Dr. Pinguin";
export const DEFAULT_OG = `${SITE_ORIGIN}/og.svg`;

const HOME_DESCRIPTION =
  "Koleksi Dr. Pinguin Bokep (M.S.B.) — nonton bokep Indo terbaru di Dr. Pinguin. Amatir, jilbab, tante, viral. Konten 18+.";

export function categoryKeywords(slugOrLabel?: string | null): string {
  const key = (slugOrLabel || "").trim().toLowerCase();
  const cat = findCategory(key) || findCategory(key.replace(/\s+/g, "-"));
  const label = cat?.label || slugOrLabel || "Indo";
  return `bokep indo, bokep ${label.toLowerCase()}, ${label.toLowerCase()} viral, koleksi dr pinguin, m.s.b, dr pinguin`;
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
    title: pageTitle(["Koleksi Dr. Pinguin Bokep", "M.S.B."]),
    description: HOME_DESCRIPTION,
    keywords:
      "koleksi dr pinguin bokep, m.s.b, msb, dr pinguin bokep, bokep dr pinguin, koleksi dr pinguin, bokep indo, bokep indo terbaru, dr pinguin",
  };
}

function normalizeEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (/indoav|userbokep|puterin|putarin|streamtape|strcloud|lulu/i.test(`${u.hostname}${u.pathname}`)) {
      u.pathname = u.pathname.replace(/\/(?:v|d|watch)\//, "/e/");
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function videoJsonLd(input: {
  id: string;
  title: string;
  description: string;
  thumbnail?: string | null;
  category?: string | null;
  embedUrl?: string | null;
  contentUrl?: string | null;
  durationSec?: number | null;
}) {
  const embed = (input.embedUrl || "").trim();
  const content = (input.contentUrl || "").trim();
  const thumb =
    input.thumbnail && input.thumbnail.startsWith("http") ? input.thumbnail : DEFAULT_OG;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: input.title,
    description: input.description,
    thumbnailUrl: thumb,
    uploadDate: "2026-01-01",
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_ORIGIN },
    genre: input.category || "Adult",
    isFamilyFriendly: "false",
    url: `${SITE_ORIGIN}/watch/${input.id}`,
    mainEntityOfPage: `${SITE_ORIGIN}/watch/${input.id}`,
  };
  if (embed) data.embedUrl = normalizeEmbedUrl(embed);
  if (content) data.contentUrl = content;
  if (input.durationSec && input.durationSec > 0) {
    data.duration = `PT${Math.round(input.durationSec)}S`;
  }
  return data;
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: ["Koleksi Dr. Pinguin", "Koleksi Dr. Pinguin Bokep", "M.S.B.", "MSB"],
    url: SITE_ORIGIN,
    description: HOME_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_ORIGIN}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
