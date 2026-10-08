import { findCategory } from "@/lib/catalog/categories";

export const SITE_ORIGIN = "https://koleksidrpinguin.com";
export const SITE_NAME = "Koleksi Dr. Pinguin";
/** Nama brand persis seperti yang dicari orang di Google (judul video di IndoAV/UserBokep pakai suffix ini). */
export const BRAND_NAME = "Koleksi Dr. Pinguin Bokep, M.S.B.";
/** og:site_name: nama situs di kartu share / sinyal nama situs. */
export const OG_SITE_NAME = "Koleksi Dr. Pinguin Bokep";
/** Suffix judul halaman: domain (keputusan pemilik), contoh "Judul | koleksidrpinguin.com". */
export const TITLE_SUFFIX = "koleksidrpinguin.com";
/** Kartu share: logo situs. Query v= bust cache Telegram/X. */
export const DEFAULT_OG = `${SITE_ORIGIN}/og-v2.jpg?v=13`;
/** Logo persegi (ikon pinguin pixel 512x512, dilayani middleware brand-icons). */
export const SITE_LOGO = `${SITE_ORIGIN}/icon-512.png`;

const HOME_DESCRIPTION =
  "Koleksi Dr. Pinguin Bokep, M.S.B., situs resmi di koleksidrpinguin.com. Katalog video dewasa 18+: bokep Indo, JAV, amatir, AI+. Update berkala.";

/** Judul beranda: frasa brand persis + domain. */
export const HOME_TITLE = `${BRAND_NAME} | ${TITLE_SUFFIX}`;

/** Kalimat pendek di bawah H1 beranda. */
export const HOME_INTRO =
  "Situs resmi Koleksi Dr. Pinguin Bokep, M.S.B. Katalog video dewasa 18+: Indo, JAV, amatir, AI+. Update berkala.";

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
  if (!unique.length) return HOME_TITLE;
  const last = unique[unique.length - 1]?.toLowerCase();
  if (last === TITLE_SUFFIX.toLowerCase() || last === SITE_NAME.toLowerCase()) {
    return unique.join(" | ");
  }
  return `${unique.join(" | ")} | ${TITLE_SUFFIX}`;
}

const MINOR_RE =
  /\b(abg|tocil|teen|teens|underage|bocil|anak|smp|sma|smk|loli|lolita|shota|remaja|bocah|pelajar|sekolah|seragam\s+sekolah|perawan\s+kecil|gadis\s+kecil|dedek|adek|adik)\b/i;

/** Hapus suffix branding situs dari judul tampil (data asli tidak diubah). */
export function cleanDisplayTitle(raw?: string | null): string {
  let t = String(raw || "").replace(/_+/g, " ").trim().replace(/\s+/g, " ");
  t = t.replace(/\s*[\(\[]\s*(koleksi\s+)?dr\.?\s*pinguin[^\)\]]*[\)\]]\s*$/gi, "");
  for (let i = 0; i < 3; i++) {
    t = t.replace(/[\s\-–—|:·,]*\b(koleksi\s+)?dr\.?\s*pinguin\.?\s*$/gi, "");
    t = t.replace(/\s*[\-|–—,]\s*M\.?S\.?B\.?\s*$/gi, "");
  }
  t = t.replace(/[\s\-–—|:·,]+$/g, "").trim();
  return t || String(raw || "").replace(/_+/g, " ").replace(/\s+/g, " ").trim() || "Video";
}

/**
 * Upload bot baru menyimpan judul "Judul - koleksidrpinguin.com" (keputusan pemilik; tetap tampil
 * di kartu/H1/og:title). Untuk <title> dan kalimat deskripsi, akhiran domain itu dilepas supaya
 * tidak jadi "… - koleksidrpinguin.com | koleksidrpinguin.com": pageTitle() memasang domain sekali,
 * dan tetap utuh walau judul panjang dipotong.
 */
export function withoutDomainSuffix(raw?: string | null): string {
  const t = String(raw || "");
  const cut = t
    .replace(/\s*[-–—|·:]?\s*(?:https?:\/\/)?(?:www\.)?koleksidrpinguin\.(?:com|site)\/?\s*$/i, "")
    .trim();
  return cut || t.trim();
}

export function videoSeoTitle(title: string, category?: string | null): string {
  const base = withoutDomainSuffix(cleanDisplayTitle(title));
  const label = safeSeoLabel(category);
  const hasLabel = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(base);
  const head = !label ? base : hasLabel ? `${base} – Bokep` : `${base} – Bokep ${label}`;
  const clipped = head.length > 58 ? `${head.slice(0, 55).trimEnd()}…` : head;
  return pageTitle([clipped]);
}

/** Hash stabil biar deskripsi meta tidak berubah tiap load. */
function stablePick(seed: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Math.abs(h | 0) % n;
}

function clipAtWord(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 48 ? cut.slice(0, sp) : cut).trimEnd().replace(/[,.;:·—-]+$/, "")}…`;
}

/** Catatan internal/dev yang tidak boleh tampil ke pengunjung. */
const INTERNAL_NOTE_RE =
  /[\s.,·—-]*(deskripsi natural,?\s*bukan spam(\s+kata(\s+kunci)?)?|bukan spam kata(\s+kunci)?|halaman tonton lengkap biar gampang ketemu di pencarian|todo:?[^.]*|seo:?[^.]*)\.?/gi;

export function stripInternalNotes(s?: string | null): string {
  return String(s || "").replace(INTERNAL_NOTE_RE, ". ").replace(/\s*\.\s*(\.\s*)+/g, ". ").replace(/\s+/g, " ").replace(/^\.\s*/, "").trim();
}

function durationPhrase(sec?: number | null): string {
  const s = Number(sec || 0);
  if (!s || s < 30) return "";
  const m = Math.round(s / 60);
  if (m < 1) return "";
  if (m < 60) return `${m} menit`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} jam ${r} menit` : `${h} jam`;
}

export type SeoVideoInput = {
  id?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  creator?: string | null;
  source?: string | null;
  duration?: number | null;
  year?: string | null;
  quality?: string | null;
  subjects?: string[] | null;
};

function safeTags(item: SeoVideoInput, label: string): string[] {
  const out: string[] = [];
  for (const raw of item.subjects || []) {
    const t = String(raw || "").trim();
    if (!t || t.length > 24 || MINOR_RE.test(t) || /pinguin/i.test(t)) continue;
    if (t.toLowerCase() === label.toLowerCase()) continue;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
    if (out.length >= 2) break;
  }
  return out;
}

/**
 * Deskripsi unik per video. Varian template dipilih stabil dari hash id,
 * memakai judul, kategori, tag, durasi, sumber, tahun. Target 140–160 karakter.
 */
function buildSentences(item: SeoVideoInput): { lead: string; detail: string; close: string } {
  const label = safeSeoLabel(item.category);
  const rawTitle = withoutDomainSuffix(cleanDisplayTitle(item.title));
  const titleOk = !MINOR_RE.test(rawTitle);
  const t = titleOk ? (rawTitle.length > 60 ? `${rawTitle.slice(0, 57).trimEnd()}…` : rawTitle) : "";
  const src0 = String(item.creator || item.source || "").trim();
  const src = src0 && !MINOR_RE.test(src0) && src0.toLowerCase() !== label.toLowerCase() ? src0 : "";
  const dur = durationPhrase(item.duration);
  const year = (item.year || "").trim();
  const tags = safeTags(item, label);
  const tagTxt = tags.length ? tags.join(" & ") : "";
  const seed = `${item.id || ""}|${rawTitle}`;
  const pick = <T,>(arr: T[], salt: string) => arr[stablePick(seed + salt, arr.length)]!;

  const subj = t ? `“${t}”` : "video ini";
  const leads = [
    `${subj} adalah video kategori ${label}${dur ? ` berdurasi sekitar ${dur}` : ""}.`,
    `${subj} masuk koleksi ${label}${year ? ` tahun ${year}` : ""}${dur ? `, panjangnya kurang lebih ${dur}` : ""}.`,
    `Tonton ${subj}, salah satu video ${label}${dur ? ` dengan durasi ${dur}` : ""}.`,
    `Video ${label} ${subj}${dur ? ` berjalan sekitar ${dur}` : " siap diputar"}.`,
    `${subj} hadir di rak ${label}${year ? ` (${year})` : ""}${dur ? `, durasi ${dur}` : ""}.`,
  ];
  const details = [
    src ? `Diunggah lewat ${src}${tagTxt ? `, bertema ${tagTxt}` : ""}.` : tagTxt ? `Temanya seputar ${tagTxt}.` : "Diputar lewat embed dari hoster pihak ketiga.",
    tagTxt ? `Nuansanya ${tagTxt}${src ? `, sumber dari ${src}` : ""}.` : src ? `Sumber video dari ${src}.` : "Bisa langsung diputar tanpa daftar akun.",
    src ? `Streaming via ${src}, bisa dibuka di HP maupun desktop.` : "Bisa dibuka nyaman di HP maupun desktop.",
    tagTxt ? `Cocok buat penggemar ${tagTxt}.` : `Cocok buat penggemar ${label}.`,
  ];
  const closes = [
    "Khusus penonton 18+.",
    "Hanya untuk usia 18 tahun ke atas.",
    "Konten dewasa, 18+ saja.",
    "Tersedia untuk pengunjung dewasa 18+.",
  ];
  const lead0 = pick(leads, "L");
  return { lead: lead0.charAt(0).toUpperCase() + lead0.slice(1), detail: pick(details, "D"), close: pick(closes, "C") };
}

function fitLength(parts: string[], min: number, max: number): string {
  let out = "";
  for (const p of parts) {
    const next = out ? `${out} ${p}` : p;
    if (next.length > max && out.length >= min - 30) break;
    out = next;
  }
  if (out.length < min) {
    const pad = ["Update koleksi berkala.", "Putar langsung tanpa ribet.", "Gratis, tanpa daftar akun.", "Selamat menonton."];
    for (const p of pad) {
      if (out.length >= min) break;
      if (`${out} ${p}`.length <= max) out = `${out} ${p}`;
    }
  }
  return clipAtWord(out, max);
}

export function videoSeoDescription(
  title: string | SeoVideoInput,
  category?: string | null,
  extra?: { creator?: string | null; source?: string | null },
): string {
  const item: SeoVideoInput =
    typeof title === "string" ? { title, category, creator: extra?.creator, source: extra?.source } : title;
  const { lead, detail, close } = buildSentences(item);
  return fitLength([lead, detail, close], 140, 160);
}

/** Paragraf tampil di halaman tonton (1–2 kalimat + penutup). */
export function videoBodyDescription(item: SeoVideoInput): string {
  const { lead, detail, close } = buildSentences(item);
  return `${lead} ${detail} ${close}`;
}

function rawLooksWeak(item: SeoVideoInput, raw: string): boolean {
  const title = String(item.title || "").trim();
  return (
    !raw ||
    raw.length < 60 ||
    raw.toLowerCase() === title.toLowerCase() ||
    /^nonton\s+/i.test(raw) ||
    /streaming amatir, jilbab/i.test(raw) ||
    /pinguin/i.test(raw) ||
    MINOR_RE.test(raw) ||
    (title.length > 8 && raw.toLowerCase().startsWith(title.toLowerCase()) && raw.length < title.length + 40)
  );
}

export function cleanRawDescription(item: SeoVideoInput): string {
  const raw = stripInternalNotes(item.description);
  return rawLooksWeak(item, raw) ? "" : raw;
}

/** Pakai deskripsi katalog hanya kalau cukup bagus; kalau tipis/ulang judul → generator. */
export function resolveVideoSeoDescription(item: SeoVideoInput): string {
  const raw = cleanRawDescription(item);
  if (raw) return clipAtWord(raw, 158);
  return videoSeoDescription(item);
}

export function absoluteThumb(thumbnail?: string | null): string {
  const raw = String(thumbnail || "").trim();
  if (!raw) return DEFAULT_OG;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${SITE_ORIGIN}${raw}`;
  return DEFAULT_OG;
}

/** True if URL looks like JPEG/PNG Google Video accepts (not webp/avif/svg). */
export function isGoogleVideoThumbFormat(url: string): boolean {
  const path = url.split("?")[0].toLowerCase();
  if (/\.(webp|avif|svg|gif|bmp|ico)($|\/)/i.test(path)) return false;
  if (/\.(jpe?g|png)($|\/)/i.test(path)) return true;
  // same-origin OG/proxy endpoints that we force to JPEG
  if (/\/api\/og(\?|$)/i.test(url) || /\/og(-v2)?\.jpg(\?|$)/i.test(url) || /\/brand-poster(-v2)?\.jpg(\?|$)/i.test(url)) {
    return true;
  }
  return false;
}

/**
 * Thumbnail for VideoObject / GSC video indexing.
 * Prefer same-origin /api/og (JPEG) so bots are not sent unreachable .webp hosters.
 */
export function seoVideoThumbnail(id?: string | null, thumbnail?: string | null): string {
  const idClean = (id || "").trim();
  if (idClean && /^[A-Za-z0-9_-]{3,64}$/.test(idClean)) {
    return `${SITE_ORIGIN}/thumb/${encodeURIComponent(idClean)}.jpg`;
  }
  const raw = String(thumbnail || "").trim();
  if (raw && isGoogleVideoThumbFormat(raw)) {
    return absoluteThumb(raw);
  }
  return DEFAULT_OG;
}

/** Canonical homepage URL — must match sitemap loc trailing slash. */
export const HOME_CANONICAL = `${SITE_ORIGIN}/`;

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
    title: HOME_TITLE,
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
  const thumb = seoVideoThumbnail(input.id, input.thumbnail);
  const pageUrl = `${SITE_ORIGIN}/watch/${input.id}`;
  const label = safeSeoLabel(input.category);

  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: String(input.title || "Video").trim(),
    description: (input.description || "").trim().slice(0, 300),
    thumbnailUrl: thumb,
    uploadDate: uploadDateFromId(input.id),
    inLanguage: "id",
    publisher: {
      "@type": "Organization",
      name: BRAND_NAME,
      url: HOME_CANONICAL,
      logo: {
        "@type": "ImageObject",
        url: SITE_LOGO,
        width: 512,
        height: 512,
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

const BRAND_ALT_NAMES = [
  "Koleksi Dr. Pinguin Bokep",
  "Koleksi Dr. Pinguin",
  "Dr. Pinguin",
  "M.S.B.",
  "bokep dr pinguin",
  "koleksidrpinguin.com",
];

function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": `${HOME_CANONICAL}#website`,
    name: BRAND_NAME,
    alternateName: BRAND_ALT_NAMES,
    url: HOME_CANONICAL,
    inLanguage: "id",
    description: HOME_DESCRIPTION,
    publisher: { "@id": `${HOME_CANONICAL}#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_ORIGIN}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

function organizationNode() {
  return {
    "@type": "Organization",
    "@id": `${HOME_CANONICAL}#organization`,
    name: BRAND_NAME,
    alternateName: BRAND_ALT_NAMES,
    url: HOME_CANONICAL,
    logo: {
      "@type": "ImageObject",
      url: SITE_LOGO,
      width: 512,
      height: 512,
    },
  };
}

export function websiteJsonLd() {
  return { "@context": "https://schema.org", ...websiteNode() };
}

export function organizationJsonLd() {
  return { "@context": "https://schema.org", ...organizationNode() };
}

/** Satu blok JSON-LD beranda (WebSite + Organization). Hanya dipasang di beranda, bukan di root. */
export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [websiteNode(), organizationNode()],
  };
}
