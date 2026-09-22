import { findCategory } from "@/lib/catalog/categories";

export const SITE_ORIGIN = "https://koleksidrpinguin.com";
export const SITE_NAME = "Dr. Pinguin";
/** Kartu share: logo situs. Query v= bust cache Telegram/X. */
export const DEFAULT_OG = `${SITE_ORIGIN}/og.jpg?v=12`;

const HOME_DESCRIPTION =
  "Koleksi Dr. Pinguin Bokep (M.S.B.) — nonton bokep Indo terbaru di Dr. Pinguin. Amatir, jilbab, tante, viral. Konten 18+.";

function categoryLabel(slugOrLabel?: string | null): string {
  const key = (slugOrLabel || "").trim().toLowerCase();
  if (!key) return "Indo";
  const cat = findCategory(key) || findCategory(key.replace(/\s+/g, "-"));
  return (cat?.label || slugOrLabel || "Indo").trim();
}

export function categoryKeywords(slugOrLabel?: string | null): string {
  const label = categoryLabel(slugOrLabel);
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
  const base = (title || "Video Bokep Indo").trim().replace(/\s+/g, " ");
  const label = categoryLabel(category);
  const hasLabel = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(base);
  const head = hasLabel || !label ? base : `${base} — ${label}`;
  const clipped = head.length > 58 ? `${head.slice(0, 55).trimEnd()}…` : head;
  return pageTitle([clipped]);
}

export function videoSeoDescription(
  title: string,
  category?: string | null,
  extra?: { creator?: string | null; source?: string | null },
): string {
  const t = (title || "video bokep Indo").trim().replace(/\s+/g, " ");
  const label = categoryLabel(category);
  const src = (extra?.creator || extra?.source || "").trim();
  const shortTitle = t.length > 70 ? `${t.slice(0, 67).trimEnd()}…` : t;
  const from = src ? ` dari ${src}` : "";
  const body = `Tonton ${shortTitle} — ${label}${from} di ${SITE_NAME}. Streaming langsung, update koleksi Indo. Konten 18+.`;
  return body.slice(0, 160);
}

export function absoluteThumb(thumbnail?: string | null): string {
  const raw = (thumbnail || "").trim();
  if (!raw) return DEFAULT_OG;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${SITE_ORIGIN}${raw}`;
  return DEFAULT_OG;
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

function uploadDateFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const day = (Math.abs(h) % 28) + 1;
  const month = (Math.abs(h >> 5) % 12) + 1;
  const year = 2025 + (Math.abs(h >> 9) % 2);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
  const thumb = absoluteThumb(input.thumbnail);
  const pageUrl = `${SITE_ORIGIN}/watch/${input.id}`;
  const label = categoryLabel(input.category);

  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: (input.title || "Video").trim(),
    description: (input.description || "").trim().slice(0, 300),
    thumbnailUrl: [DEFAULT_OG, thumb],
    uploadDate: uploadDateFromId(input.id),
    inLanguage: "id",
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_ORIGIN,
      logo: {
        "@type": "ImageObject",
        url: DEFAULT_OG.split("?")[0],
      },
    },
    genre: label,
    isFamilyFriendly: false,
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    potentialAction: {
      "@type": "WatchAction",
      target: pageUrl,
    },
    ...(embed ? { embedUrl: normalizeEmbedUrl(embed) } : {}),
    ...(content ? { contentUrl: content } : {}),
    ...(input.durationSec && input.durationSec > 0
      ? { duration: `PT${Math.round(input.durationSec)}S` }
      : {}),
  };
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
