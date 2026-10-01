import { findCategory } from "@/lib/catalog/categories";

export const SITE_ORIGIN = "https://koleksidrpinguin.com";
export const SITE_NAME = "Dr. Pinguin";
/** Kartu share: logo situs. Query v= bust cache Telegram/X. */
export const DEFAULT_OG = `${SITE_ORIGIN}/og.jpg?v=12`;

const HOME_DESCRIPTION =
  "Katalog video dewasa 18+ Dr. Pinguin. Streaming embed koleksi Indo, JAV, amatir. Update berkala.";

function categoryLabel(slugOrLabel?: string | null): string {
  const key = (slugOrLabel || "").trim().toLowerCase();
  if (!key) return "Indo";
  const cat = findCategory(key) || findCategory(key.replace(/\s+/g, "-"));
  return (cat?.label || slugOrLabel || "Indo").trim();
}


/** Jangan amplify kategori yang mengarah ke minor / underage di meta. */
function safeSeoLabel(slugOrLabel?: string | null): string {
  const label = categoryLabel(slugOrLabel);
  if (/\b(abg|teen|underage|bocil|anak|smp|sma|loli|shota|remap)\b/i.test(label)) {
    return "Dewasa";
  }
  return label;
}

export function categoryKeywords(slugOrLabel?: string | null): string {
  const label = safeSeoLabel(slugOrLabel);
  return `bokep ${label}, ${label} indo, Dr. Pinguin`;
}

export function pageTitle(parts: Array<string | null | undefined>): string {
  const clean = parts.map((p) => (p || "").trim()).filter(Boolean);
  const unique = clean.filter((p, i) => clean.findIndex((x) => x.toLowerCase() === p.toLowerCase()) === i);
  if (!unique.length) return SITE_NAME;
  if (unique[unique.length - 1]?.toLowerCase() === SITE_NAME.toLowerCase()) {
    return unique.join(" | ");
  }
  return `${unique.join(" | ")} | ${SITE_NAME}`;
}

export function videoSeoTitle(title: string, category?: string | null): string {
  const base = (title || "Video").trim().replace(/\s+/g, " ");
  const label = safeSeoLabel(category);
  const hasLabel = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(base);
  const head = hasLabel || !label ? base : `${base} — ${label}`;
  const clipped = head.length > 58 ? `${head.slice(0, 55).trimEnd()}…` : head;
  return pageTitle([clipped]);
}

/** Hash stabil biar deskripsi meta tidak berubah tiap load. */
function stablePick(seed: string, n: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
}

function clipAtWord(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 48 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

/**
 * Meta description kompetitif: 4 varian natural Bahasa Indonesia,
 * dipilih stabil dari judul+kategori+sumber, target ~130–155 karakter.
 */
export function videoSeoDescription(
  title: string,
  category?: string | null,
  extra?: { creator?: string | null; source?: string | null },
): string {
  const t = (title || "video").trim().replace(/\s+/g, " ");
  const label = safeSeoLabel(category);
  const src = (extra?.creator || extra?.source || "").trim();
  const tagBit =
    src &&
    src.toLowerCase() !== label.toLowerCase() &&
    !/\b(abg|teen|underage|bocil|anak|smp|sma|loli|shota|remap)\b/i.test(src)
      ? src
      : "";
  const shortT = t.length > 72 ? `${t.slice(0, 69).trimEnd()}…` : t;

  const variants = [
    `Nonton ${shortT} di ${SITE_NAME}. Koleksi ${label}${tagBit ? ` dari ${tagBit}` : ""} yang sering dicari, streaming tanpa ribet. Konten dewasa 18+.`,
    `${shortT} masuk katalog ${label} di ${SITE_NAME}${tagBit ? ` (${tagBit})` : ""}. Halaman tonton lengkap biar gampang ketemu di pencarian. Usia 18+.`,
    `${shortT} tersedia di ${SITE_NAME}${tagBit ? ` · ${tagBit}` : ""}, kategori ${label}. Deskripsi natural, bukan spam kata kunci. Konten 18+.`,
    `${shortT} — upload ${label}${tagBit ? ` · ${tagBit}` : ""} di ${SITE_NAME}. Cocok buat yang mau tonton katalog streaming dewasa. 18+.`,
  ];

  const picked = variants[stablePick(`${t}|${label}|${tagBit}`, variants.length)]!;
  return clipAtWord(picked, 155);
}

/** Pakai deskripsi katalog hanya kalau cukup bagus; kalau tipis/ulang judul → generator. */
export function resolveVideoSeoDescription(item: {
  title: string;
  description?: string | null;
  category?: string | null;
  creator?: string | null;
  source?: string | null;
}): string {
  const title = (item.title || "").trim();
  const raw = (item.description || "").trim();
  const looksWeak =
    !raw ||
    raw.length < 60 ||
    raw.toLowerCase() === title.toLowerCase() ||
    /^nonton\s+/i.test(raw) ||
    /streaming amatir, jilbab/i.test(raw) ||
    raw === `${title} —` ||
    (title.length > 8 && raw.toLowerCase().startsWith(title.toLowerCase()) && raw.length < title.length + 40);

  if (!looksWeak) return clipAtWord(raw, 155);
  return videoSeoDescription(title, item.category, {
    creator: item.creator,
    source: item.source,
  });
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
      title: pageTitle([`Cari “${q}”`]),
      description: `Hasil pencarian “${q}” di ${SITE_NAME}. Konten 18+.`,
      keywords: `${q}, ${SITE_NAME}`,
    };
  }
  const cat = findCategory(category);
  if (cat) {
    const label = safeSeoLabel(cat.slug || cat.label);
    return {
      title: pageTitle([`Bokep ${label}`]),
      description: `Katalog bokep ${label} 18+ di ${SITE_NAME}. Streaming embed, update berkala.`,
      keywords: categoryKeywords(cat.slug),
    };
  }
  return {
    title: pageTitle(["Bokep Dr. Pinguin", "Koleksi M.S.B."]),
    description: HOME_DESCRIPTION,
    keywords: "bokep dr pinguin, koleksi dr pinguin, M.S.B., 18+",
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
    thumbnailUrl: thumb,
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
    alternateName: ["Koleksi Dr. Pinguin", "M.S.B.", "bokep dr pinguin"],
    url: SITE_ORIGIN,
    description: HOME_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_ORIGIN}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
