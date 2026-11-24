import { publicationDate } from "./catalog/publication-date.js";
import { findCategory } from "@/lib/catalog/categories";
import { curatedDescription } from "@/lib/catalog/video-descriptions";

export const SITE_ORIGIN = "https://koleksidrpinguin.com";
export const SITE_NAME = "Koleksi Dr. Pinguin";
/** Nama brand persis seperti yang dicari orang di Google (judul video di IndoAV/UserBokep pakai suffix ini). */
export const BRAND_NAME = "Koleksi Dr. Pinguin Bokep, M.S.B.";
/** og:site_name: nama situs di kartu share / sinyal nama situs. */
export const OG_SITE_NAME = "Koleksi Dr. Pinguin Bokep";
/** Suffix judul halaman: domain (keputusan pemilik), contoh "Judul | koleksidrpinguin.com". */
export const TITLE_SUFFIX = "koleksidrpinguin.com";
/** Kartu share: logo situs. Query v= bust cache Telegram/X. */
export const DEFAULT_OG = `${SITE_ORIGIN}/og-v2.jpg?v=14`;
/** Logo persegi (ikon pinguin pixel 512x512, dilayani middleware brand-icons). */
export const SITE_LOGO = `${SITE_ORIGIN}/icon-512.png`;

/** Snippet beranda: update harian + streaming tanpa VPN (pola growth, teks sendiri). */
export const HOME_DESCRIPTION =
  "Nonton bokep indo terbaru, update setiap hari, di koleksidrpinguin.com. Streaming lancar di HP tanpa VPN dan tanpa daftar akun. Khusus dewasa 18+.";

/** Judul beranda. Brand di depan, frasa update harian, tetap di bawah 60 karakter. */
export const HOME_TITLE = "Koleksi Dr. Pinguin - Bokep Indo Update Setiap Hari";

/** H1 beranda, selaras dengan judul tab. */
export const HOME_H1 = "Bokep Indo Terbaru Update Setiap Hari";

/** Kalimat pendek di bawah H1 beranda. */
export const HOME_INTRO =
  "Bokep indo terbaru di Koleksi Dr. Pinguin, ditambah setiap hari dari katalog sendiri. Putar langsung di HP tanpa VPN, tanpa aplikasi, dan tanpa login. Konten khusus 18+.";

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
  t = t.replace(/\s*[([]\s*(koleksi\s+)?dr\.?\s*pinguin[^)\]]*[)\]]\s*$/gi, "");
  for (let i = 0; i < 3; i++) {
    t = t.replace(/[\s\-–—|:·,]*\b(koleksi\s+)?dr\.?\s*pinguin\.?\s*$/gi, "");
    t = t.replace(/\s*[-|–—,]\s*M\.?S\.?B\.?\s*$/gi, "");
  }
  t = t.replace(/[\s\-–—|:·,]+$/g, "").trim();
  // "TerakotaEpisode 2" -> "Terakota Episode 2" (display only, the stored title is unchanged).
  t = t.replace(/(\p{Ll})(Episode|Eps|Ep|Part|Bagian)(?=\.?\s*#?\s*\d)/gu, "$1 $2");
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

/**
 * Label kategori untuk kalimat/judul SEO halaman tonton. Kategori "bokep" berlabel nama brand
 * ("Koleksi Dr. Pinguin Bokep") dan Videy berlabel "drpinguin videy": di judul dan deskripsi itu
 * jadi "Bokep Koleksi Dr. Pinguin Bokep" / "penggemar Koleksi Dr. Pinguin Bokep", jadi dipetakan
 * ke kata yang dicari orang.
 */
function videoTextLabel(category?: string | null): string {
  const key = (category || "").trim().toLowerCase();
  // Videy first: its label is "drpinguin videy", which the /pinguin/ brand check would turn into "Indo".
  if (key === "videy") return "Videy";
  if (!key || key === "bokep" || key === "lainnya" || /pinguin/i.test(categoryLabel(category))) return "Indo";
  return safeSeoLabel(category);
}

/** Potong di batas kata (tanpa sisa tanda baca/pemisah), tambah "…" hanya kalau benar-benar dipotong. */
function clipWords(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  const head = sp >= Math.floor(max * 0.5) ? cut.slice(0, sp) : cut;
  return `${head.replace(/[\s,.;:·|–—-]+$/, "")}…`;
}

/**
 * Untuk judul yang terlalu panjang saja: "(Koleksi Dr. Pinguin Bokep, M.S.B.)" di tengah judul dilepas
 * sebelum dipotong, supaya hasilnya tidak berhenti di "(Koleksi Dr…". Domain " | koleksidrpinguin.com"
 * tetap dipasang pageTitle(), dan judul yang muat utuh tidak diubah.
 */
function clipTitleText(s: string, max: number): string {
  if (s.length <= max) return s;
  const compact = s.replace(/\s*[([]\s*(?:koleksi\s+)?dr\.?\s*pinguin[^)\]]*[)\]]/gi, "").replace(/\s+/g, " ").trim();
  return clipWords(compact || s, max);
}

/** Batas panjang bagian judul sebelum " | koleksidrpinguin.com" (total ±80 karakter). */
const VIDEO_TITLE_HEAD_MAX = 58;

/** Judul tanpa domain dan tanpa "(Koleksi Dr. Pinguin …)" walau keduanya menempel ("… (Koleksi Dr. Pinguin) - koleksidrpinguin.com"). */
function seoBaseTitle(raw?: string | null): string {
  return withoutDomainSuffix(cleanDisplayTitle(withoutDomainSuffix(raw)));
}

export function videoSeoTitle(title: string, category?: string | null): string {
  const base = seoBaseTitle(title);
  const label = videoTextLabel(category);
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hasLabel = new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "iu").test(base);
  const hasBokep = /\bbokep\b/i.test(base);
  // Kategori hanya ditempel kalau muat utuh; tidak pernah jadi potongan seperti "– Bo…".
  const tails = hasLabel ? (hasBokep ? [] : [" – Bokep"]) : hasBokep ? [` – ${label}`] : [` – Bokep ${label}`, " – Bokep"];
  for (const tail of tails) {
    if (base.length + tail.length <= VIDEO_TITLE_HEAD_MAX) return pageTitle([`${base}${tail}`]);
  }
  return pageTitle([clipTitleText(base, VIDEO_TITLE_HEAD_MAX)]);
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

/** Catatan internal/dev yang tidak boleh tampil ke pengunjung. "seo:" / "todo:" wajib ada titik duanya, supaya "seorang" tidak ikut terhapus. */
const INTERNAL_NOTE_RE =
  /[\s.,·—-]*(?:deskripsi natural,?\s*bukan spam(?:\s+kata(?:\s+kunci)?)?|bukan spam kata(?:\s+kunci)?|halaman tonton lengkap biar gampang ketemu di pencarian|\btodo\s*:[^.]*|\bseo\s*:[^.]*)\.?/gi;

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

/** Panjang maksimum deskripsi manual pemilik (owner-tools "edit-video"). */
export const MANUAL_DESCRIPTION_MAX = 1000;

/** Teks bawaan katalog lama yang artinya "tidak ada deskripsi". */
const EMPTY_DESCRIPTION_RE = /^(tidak ada sinopsis|no description)\.?$/i;

/**
 * Filter keamanan deskripsi manual: kata terlarang (minor/sekolah) tidak pernah tampil.
 * Server memakai ini juga saat menyimpan, jadi deskripsi yang ditolak tidak diam-diam hilang.
 */
export function isSafeManualDescription(s?: string | null): boolean {
  const t = String(s || "").trim();
  return Boolean(t) && !MINOR_RE.test(t);
}

/**
 * Deskripsi manual pemilik (field `description`), sudah dibersihkan dari catatan internal.
 * "" = kosong atau tidak lolos filter keamanan → pakai deskripsi otomatis.
 */
export function manualDescription(item: Pick<SeoVideoInput, "description">): string {
  const t = stripInternalNotes(item.description).slice(0, MANUAL_DESCRIPTION_MAX).trim();
  if (!t || EMPTY_DESCRIPTION_RE.test(t)) return "";
  return isSafeManualDescription(t) ? t : "";
}

/**
 * Deskripsi publik halaman tonton. Satu teks, dipakai meta, paragraf, VideoObject, dan sitemap.
 * Manual pemilik (/pemilik) selalu menang. Kalau kosong: teks kurasi per id, lalu kalimat yang
 * beda tiap video (judul sekali, kategori, durasi, sumber). Judul halaman tidak diubah.
 */
export function publicWatchDescription(item: SeoVideoInput, max = 0): string {
  const manual = manualDescription(item);
  if (manual) return max > 0 ? clipAtWord(manual, max) : manual;
  const curated = curatedWatchText(item.id);
  if (curated) return max > 0 ? clipAtWord(curated, max) : curated;
  const text = generatedWatchDescription(item);
  return max > 0 ? clipAtWord(text, max) : text;
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

/** Teks kurasi per id, hanya kalau lolos filter yang sama dengan deskripsi manual. */
function curatedWatchText(id?: string | null): string {
  const text = stripInternalNotes(curatedDescription(id));
  return isSafeManualDescription(text) ? text : "";
}

/** Cuplikan meta. Kalimat generator muat di sini, jadi teks yang kelihatan sama dengan meta. */
const WATCH_DESC_MAX = 158;

const WATCH_PLAY = [
  "Putar langsung di HP, tanpa akun.",
  "Streaming tanpa daftar dan tanpa VPN.",
  "Bisa dibuka di HP maupun desktop.",
  "Tidak perlu login untuk memutar.",
  "Langsung play di browser.",
  "Tonton di koleksidrpinguin.com, tanpa download.",
  "Siap diputar, tanpa ribet daftar.",
  "Putar di sini, gratis tanpa akun.",
];

const WATCH_CLOSE = ["Khusus 18+.", "Penonton 18+ saja.", "Konten dewasa 18+.", "Hanya untuk usia 18+."];

function displayLabel(label: string): string {
  const t = label.trim();
  if (!t) return "Indo";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function watchSource(item: SeoVideoInput, label: string): string {
  const src0 = String(item.creator || item.source || "").replace(/\s+/g, " ").trim();
  if (!src0 || /^(unknown|text import|import)$/i.test(src0)) return "";
  if (MINOR_RE.test(src0) || /pinguin/i.test(src0)) return "";
  if (src0.toLowerCase() === label.toLowerCase()) return "";
  return src0;
}

function quoteTitle(title: string, budget: number): string {
  const bare = title.replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
  if (!bare) return "Video ini";
  if (bare.length <= budget) return `“${bare}”`;
  // "Part 2" / "Episode 3" di ujung tetap, biar seri yang judulnya mirip tidak dapat kalimat yang sama.
  const ep = bare.match(/\b(?:part|episode|eps|ep|bagian)\.?\s*#?\s*\d+\s*$/i);
  const suffix = ep ? ` ${ep[0].trim()}` : "";
  const headSrc = ep ? bare.slice(0, bare.length - ep[0].length).trim() : bare;
  const room = Math.max(8, budget - suffix.length);
  const head = headSrc.length <= room ? headSrc : clipTitleText(headSrc, room);
  return `“${head}${suffix}”`;
}

type WatchBits = { q: string; label: string; dur: string; src: string; year: string; play: string; close: string };

/** Delapan rangkaian kalimat. Fakta yang sama tetap beda karena urutan dan penutupnya lain. */
function watchShapes(): Array<(b: WatchBits) => string> {
  return [
    (b) => {
      const facts = [b.dur, `kategori ${b.label}`, b.src ? `dari ${b.src}` : ""].filter(Boolean).join(", ");
      return `${b.q}${facts ? `, ${facts}` : ""}. ${b.play} ${b.close}`;
    },
    (b) => {
      const facts = [`Kategori ${b.label}`, b.dur, b.src ? `sumber ${b.src}` : ""].filter(Boolean).join(", ");
      return `${facts}: ${b.q}. ${b.play} ${b.close}`;
    },
    (b) => {
      const where = b.src ? `di rak ${b.label} (${b.src})` : `di rak ${b.label}`;
      return b.dur ? `${b.q} berjalan ${b.dur} ${where}. ${b.play} ${b.close}` : `${b.q} ada ${where}. ${b.play} ${b.close}`;
    },
    (b) => {
      const head = b.src ? `Dari ${b.src}, ${b.q}` : b.q;
      const year = b.year ? ` tahun ${b.year}` : "";
      const dur = b.dur ? `, durasi ${b.dur}` : "";
      return `${head} masuk kategori ${b.label}${year}${dur}. ${b.play} ${b.close}`;
    },
    (b) => {
      const meta = [b.dur, b.src ? `dari ${b.src}` : ""].filter(Boolean).join(" ");
      return `Rekaman ${b.label}${meta ? ` ${meta}` : ""} berjudul ${b.q}. ${b.play} ${b.close}`;
    },
    (b) => {
      const extra = [b.year ? `tahun ${b.year}` : "", b.dur ? `sekitar ${b.dur}` : "", b.src ? `file dari ${b.src}` : ""].filter(Boolean).join(", ");
      return `${b.q} bisa ditonton di kategori ${b.label}${extra ? `, ${extra}` : ""}. ${b.play} ${b.close}`;
    },
    (b) => {
      const meta = [b.label, b.dur, b.src].filter(Boolean).join(", ");
      return `Halaman tonton ${b.q}: ${meta}. ${b.play} ${b.close}`;
    },
    (b) => {
      const dur = b.dur ? ` (${b.dur})` : "";
      const src = b.src ? ` lewat ${b.src}` : "";
      return `Video ${b.label} ${b.q}${dur}${src}. ${b.play} ${b.close}`;
    },
  ];
}

function tidySentence(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\s+([,.])/g, "$1").replace(/,\s*,/g, ",").trim();
}

/** Kalimat unik per video. Stabil dari id, judul muncul sekali, muat di cuplikan meta. */
function generatedWatchDescription(item: SeoVideoInput): string {
  const label = displayLabel(videoTextLabel(item.category));
  const rawTitle = seoBaseTitle(item.title);
  const title = rawTitle && rawTitle.toLowerCase() !== "video" ? rawTitle : "";
  const src = watchSource(item, label);
  const dur = durationPhrase(item.duration);
  const year = /^\d{4}$/.test(String(item.year || "").trim()) ? String(item.year).trim() : "";
  const seed = `${item.id || ""}|${rawTitle}|desc`;
  const shapes = watchShapes();
  const shape = shapes[stablePick(`${seed}|s`, shapes.length)]!;
  const play = WATCH_PLAY[stablePick(`${seed}|p`, WATCH_PLAY.length)]!;
  const close = WATCH_CLOSE[stablePick(`${seed}|c`, WATCH_CLOSE.length)]!;
  const build = (budget: number) => tidySentence(shape({ q: quoteTitle(title, budget), label, dur, src, year, play, close }));
  let budget = Math.max(title.length, 8);
  let text = build(budget);
  while (text.length > WATCH_DESC_MAX && budget > 8) {
    budget -= Math.max(1, text.length - WATCH_DESC_MAX);
    text = build(budget);
  }
  return text.length <= WATCH_DESC_MAX ? text : clipAtWord(text, WATCH_DESC_MAX);
}

export function videoSeoDescription(
  title: string | SeoVideoInput,
  category?: string | null,
  extra?: { creator?: string | null; source?: string | null },
): string {
  const item: SeoVideoInput =
    typeof title === "string" ? { title, category, creator: extra?.creator, source: extra?.source } : title;
  return publicWatchDescription(item, WATCH_DESC_MAX);
}

/** Paragraf tampil di halaman tonton. Sama dengan deskripsi publik, tanpa kalimat tambahan. */
export function videoBodyDescription(item: SeoVideoInput): string {
  return publicWatchDescription(item);
}

/** Deskripsi manual pemilik dulu; kalau kosong, teks kurasi atau generator. */
export function resolveVideoSeoDescription(item: SeoVideoInput): string {
  return publicWatchDescription(item, WATCH_DESC_MAX);
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
  if (/\/api\/og(\?|$)/i.test(url) || /\/og\/[A-Za-z0-9_-]+(?:\.jpe?g)?(\?|$)/i.test(url) || /\/og(-v2)?\.jpg(\?|$)/i.test(url) || /\/brand-poster(-v2)?\.jpg(\?|$)/i.test(url)) {
    return true;
  }
  return false;
}

/**
 * Thumbnail for VideoObject / GSC video indexing.
 * Prefer same-origin /og/<id>.jpg (JPEG) so bots are not sent unreachable .webp hosters.
 */
export function seoVideoThumbnail(id?: string | null, thumbnail?: string | null): string {
  const idClean = (id || "").trim();
  if (idClean && /^[A-Za-z0-9_-]{3,64}$/.test(idClean)) {
    return `${SITE_ORIGIN}/og/${encodeURIComponent(idClean)}.jpg`;
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

export function videoJsonLd(input: {
  id: string;
  title: string;
  description: string;
  thumbnail?: string | null;
  category?: string | null;
  embedUrl?: string | null;
  contentUrl?: string | null;
  durationSec?: number | null;
  /** Total pageviews for this video — emitted as interactionStatistic (WatchAction count). */
  views?: number | null;
  /** Tanggal unggah asli (createdAt/date katalog). Bukti originalitas: tanggal kita lebih awal dari situs penyalin. */
  uploadDate?: string | number | null;
}) {
  const embed = (input.embedUrl || "").trim();
  const content = (input.contentUrl || "").trim();
  const thumb = seoVideoThumbnail(input.id, input.thumbnail);
  const pageUrl = `${SITE_ORIGIN}/watch/${input.id}`;
  const label = videoTextLabel(input.category);
  const uploaded = publicationDate(input.uploadDate);
  if (!uploaded) return null;

  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: String(input.title || "Video").trim(),
    description: (input.description || "").trim().slice(0, 300),
    thumbnailUrl: thumb,
    uploadDate: uploaded,
    inLanguage: "id",
    isPartOf: { "@id": `${HOME_CANONICAL}#website` },
    copyrightHolder: { "@id": `${HOME_CANONICAL}#organization` },
    publisher: {
      "@type": "Organization",
      "@id": `${HOME_CANONICAL}#organization`,
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
    ...(typeof input.views === "number" && input.views > 0
      ? {
          interactionStatistic: {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/WatchAction",
            userInteractionCount: Math.floor(input.views),
          },
        }
      : {}),
    ...(embed && embed !== content ? { embedUrl: normalizeEmbedUrl(embed) } : {}),
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
  "Koleksi Dr Pinguin",
  "Dr Pinguin",
  "koleksidrpinguin",
  "Bokep Dr Pinguin",
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
    email: "dmca@koleksidrpinguin.com",
    foundingLocation: "Indonesia",
  };
}

/** BreadcrumbList untuk halaman non-watch (kategori, tentang). */
export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

/** CollectionPage untuk halaman kategori, terhubung ke WebSite brand. */
/**
 * CollectionPage for category / landing pages. With `items` (the videos rendered on this page) it
 * also carries mainEntity ItemList -> /watch URLs, so Google sees which videos the list page holds.
 * `startPosition` keeps ListItem positions continuous across /halaman/N pages.
 */
export function collectionPageJsonLd(input: {
  name: string;
  url: string;
  description: string;
  items?: ReadonlyArray<{ id: string; title?: string | null }>;
  startPosition?: number;
}) {
  const items = (input.items || []).filter((v) => v && typeof v.id === "string" && v.id).slice(0, 48);
  const start = Math.max(1, Math.floor(input.startPosition || 1));
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    url: input.url,
    description: input.description,
    inLanguage: "id",
    isPartOf: { "@id": `${HOME_CANONICAL}#website` },
    publisher: { "@id": `${HOME_CANONICAL}#organization` },
    ...(items.length
      ? {
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: items.length,
            itemListElement: items.map((v, i) => ({
              "@type": "ListItem",
              position: start + i,
              url: `${SITE_ORIGIN}/watch/${encodeURIComponent(v.id)}`,
              ...(v.title ? { name: String(v.title).slice(0, 110) } : {}),
            })),
          },
        }
      : {}),
  };
}

/** Video cards from a catalog loader response (category / landing), or [] for anything else. */
export function loaderItems(loaderData: unknown): Array<{ id: string; title?: string | null }> {
  const ld = loaderData as { ok?: boolean; items?: unknown } | undefined;
  if (!ld || !ld.ok || !Array.isArray(ld.items)) return [];
  return (ld.items as Array<{ id?: unknown; title?: unknown }>)
    .filter((v) => v && typeof v.id === "string" && v.id)
    // Owner decision 2026-11-20: "Andini Permata" titles stay out of every SEO surface.
    .filter((v) => !/andini\s*permata/i.test(typeof v.title === "string" ? v.title : ""))
    .map((v) => ({
      id: v.id as string,
      // Card titles often end in " - koleksidrpinguin.com"; the list item name is just the video.
      title: typeof v.title === "string" ? v.title.replace(/\s*[-–|]\s*koleksidrpinguin\.com\s*$/i, "").trim() || null : null,
    }));
}

export const ABOUT_TITLE = `Tentang ${SITE_NAME} - Situs Resmi koleksidrpinguin.com`;
export const ABOUT_DESCRIPTION =
  "Tentang Koleksi Dr. Pinguin (Dr. Pinguin, M.S.B.): situs resmi koleksidrpinguin.com, katalog video dewasa 18+ yang dikurasi sendiri. Cara mengenali situs asli dan kontak.";

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

/**
 * SEO title for watch pages whose stored title says nothing to a searcher: bot placeholders
 * ("Koleksi Dr. Pinguin Bokep 18"), bare "videy"/"video N" names, or titles that are mostly
 * non-Latin (Chinese Byse uploads). Only <title>, meta description and og/twitter title use it; the
 * visible H1/card title and the data files keep the stored title. Deterministic per video id, so
 * every page gets a stable, (practically) unique title. No minor-related words, ever.
 */
const WEAK_TITLE_RES = [
  /^(?:koleksi\s+)?dr\.?\s*pinguin(?:\s+bokep)?\s*#?\d*$/i,
  /^(?:drpinguin\s+)?videy(?:\s+koleksidrpinguin(?:\.com)?)?\s*#?\d*$/i,
  /^(?:video|vid|bokep|untitled|tanpa\s+judul)\s*#?\d*$/i,
  /^[\w-]{0,3}$/,
];

function mostlyNonLatin(s: string): boolean {
  const letters = s.replace(/[\s\d\p{P}\p{S}]/gu, "");
  if (!letters) return false;
  const latin = (letters.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
  return latin / letters.length < 0.5;
}

export function isWeakVideoTitle(raw?: string | null): boolean {
  const t = withoutDomainSuffix(cleanDisplayTitle(raw)).trim();
  if (!t || t === "Video") return true;
  if (WEAK_TITLE_RES.some((re) => re.test(t))) return true;
  return mostlyNonLatin(t);
}

function generatedPhrases(raw: string, category?: string | null): string[] {
  const t = String(raw || "");
  const cjk = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/.test(t);
  if (cjk && /(ai短剧|短剧|\bai\b|ＡＩ)/i.test(t)) {
    return [
      "Bokep AI China Short Drama Terbaru",
      "Video AI China Short Drama Hot",
      "Film Pendek AI China Dewasa Terbaru",
      "Bokep AI China Viral Terbaru",
    ];
  }
  if (cjk) return ["Bokep China Terbaru", "Video Bokep China Viral", "Bokep Asia China Hot Terbaru"];
  const key = (category || "").trim().toLowerCase();
  if (key === "videy") return ["Video Viral Videy Terbaru", "Bokep Videy Viral Terbaru", "Video Videy Indo Viral"];
  if (!key || key === "bokep" || key === "lainnya") {
    return ["Bokep Indo Viral Terbaru", "Video Bokep Indo Terbaru", "Bokep Indo Hot Viral", "Koleksi Bokep Indo Terbaru"];
  }
  const label = safeSeoLabel(category);
  return [`Bokep ${label} Terbaru`, `Video Bokep ${label} Viral`, `Bokep ${label} Indo Terbaru`];
}

export type GeneratedVideoSeo = { title: string; ogTitle: string; description: string };

export function generatedVideoSeo(item: { id?: string | null; title: string; category?: string | null }): GeneratedVideoSeo | null {
  if (!isWeakVideoTitle(item.title)) return null;
  const id = String(item.id || item.title || "");
  const phrases = generatedPhrases(item.title, item.category);
  const phrase = phrases[stablePick(`${id}|p`, phrases.length)]!;
  const n = 100 + stablePick(`${id}|n`, 9900);
  const ogTitle = `${phrase} #${n}`;
  const title = `${ogTitle} | ${SITE_NAME}`;
  const leads = [
    `Nonton ${phrase} #${n} gratis di HP, langsung putar tanpa daftar.`,
    `${phrase} #${n}: streaming lancar di HP maupun desktop, tanpa ribet.`,
    `Tonton ${phrase} #${n}, update koleksi tiap hari di ${SITE_NAME}.`,
  ];
  const closes = ["Khusus penonton 18+.", "Hanya untuk usia 18 tahun ke atas.", "Konten dewasa, 18+ saja."];
  const description = clipAtWord(
    `${leads[stablePick(`${id}|l`, leads.length)]} Pilihan terbaru dari ${SITE_NAME}. ${closes[stablePick(`${id}|c`, closes.length)]}`,
    158,
  );
  return { title, ogTitle, description };
}
