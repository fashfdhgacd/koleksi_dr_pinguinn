import { type PublicLanguage } from "./public-locale.ts";
import { translate } from "./public-ui.ts";

const sections: Record<string, [string, string]> = {
  kategori: ["Kategori video", "Video categories"], cari: ["Carian popular", "Popular searches"],
  genre: ["Genre video", "Video genres"], tentang: ["Tentang kami", "About us"], kontak: ["Hubungi kami", "Contact us"],
  privasi: ["Dasar privasi", "Privacy policy"], syarat: ["Terma penggunaan", "Terms of use"],
  laporan: ["Laporan ketelusan", "Transparency report"], teman: ["Rakan laman", "Partner sites"],
  kirim: ["Hantar video", "Submit a video"], dmca: ["Hak cipta dan permohonan penurunan", "Copyright and removal requests"],
  "2257": ["Pernyataan 2257", "2257 statement"],
};

export function pageCopy(path: string, language: PublicLanguage, originalTitle: string, query?: string | null) {
  if (path.startsWith("/en/") && language !== "en") {
    const label = collectionHeading(path.split("/")[2], language, originalTitle.split(" | ")[0]);
    return { label, title: label + " | " + (originalTitle.split(" | ").at(-1) || label), description: collectionIntro(label, language) };
  }
  if (language === "id" || /^\/en(?:\/|$)/.test(path)) return null;
  const ms = language === "ms";
  const [, section, slug] = path.split("/");
  const brand = originalTitle.split(" | ").at(-1) || "";
  const original = originalTitle.split(" | ")[0];
  let label = sections[section]?.[ms ? 0 : 1] || (ms ? "Video terkini" : "Latest videos");
  let description = ms ? "Terokai koleksi video terkini untuk penonton berumur 18 tahun ke atas." : "Explore the latest videos for viewers aged 18 and over.";
  if (section === "watch" || section === "v") {
    label = original;
    description = ms ? `Tonton “${original}”. Lihat maklumat video dan pilihan tontonan berkaitan. Khas untuk dewasa.` : `Watch “${original}”. View video details and related titles. Adults only.`;
  } else if (query) {
    label = ms ? `Hasil carian untuk “${query}”` : `Search results for “${query}”`;
    description = label + ".";
  } else if (["kategori","genre","cari"].includes(section) && slug) {
    label = collectionLabel(slug, language);
    description = collectionBlurb(label, language);
  } else if (sections[section]) {
    description = ms ? `${label} — maklumat dan pautan di ${brand}.` : `${label} — information and links on ${brand}.`;
  }
  const page = /\/halaman\/(\d+)$/.exec(path)?.[1];
  if (page) {
    label += ms ? ` – Halaman ${page}` : ` – Page ${page}`;
    const listing = section === "kategori" || section === "genre" || section === "cari" || section === "halaman" || path.startsWith("/en/");
    if (listing) return { label, title: `${label} | Koleksi Dr. Pinguin`, description };
  }
  return { label, title: brand && brand !== label ? label + " | " + brand : label, description };
}

/** Category blurb. A label that already starts with "Koleksi" is not prefixed again. */
export function collectionBlurb(label: string, language: PublicLanguage): string {
  if (language === "ms") {
    const name = /^koleksi\b/i.test(label) ? label : `koleksi ${label}`;
    return `Terokai ${name} dan pilih video untuk ditonton. Untuk penonton 18 tahun ke atas.`;
  }
  return `Browse the ${label} collection and choose a video to watch. For viewers aged 18 and over.`;
}

export function collectionLabel(slug: string, language: PublicLanguage) {
  const key = slug.replace(/-/g, " ");
  return translate(language, key[0]?.toUpperCase() + key.slice(1));
}

const collectionNames: Record<string, [string, string]> = {
  "indo-viral": [
    "Video tular Indonesia",
    "Video viral Indonesia"
  ],
  "indo-western": [
    "Pasangan Indonesia dan Barat",
    "Pasangan Indonesia dan Barat"
  ],
  "indonesian-tiktok": [
    "Video Indonesia gaya TikTok",
    "Video Indonesia bergaya TikTok"
  ],
  "indonesian-outdoor": [
    "Rakaman luar Indonesia",
    "Video luar ruangan Indonesia"
  ],
  "indonesian-bathroom": [
    "Video bilik mandi Indonesia",
    "Video kamar mandi Indonesia"
  ],
  "indonesian-couple": [
    "Pasangan Indonesia",
    "Pasangan Indonesia"
  ],
  "indonesian-ex": [
    "Bekas pasangan Indonesia",
    "Mantan pasangan Indonesia"
  ],
  "indonesian-neighbor": [
    "Kisah jiran Indonesia",
    "Kisah tetangga Indonesia"
  ],
  "indonesian-office": [
    "Video pejabat Indonesia",
    "Video kantor Indonesia"
  ],
  "indonesian-famous": [
    "Gaya pempengaruh Indonesia",
    "Gaya kreator Indonesia"
  ],
  "malaysian-hijab": [
    "Wanita bertudung Malaysia",
    "Wanita berhijab Malaysia"
  ],
  "indonesian-softcore-films": [
    "Filem dewasa Indonesia",
    "Film dewasa Indonesia"
  ],
  "indonesian-dirty-talk": [
    "Video Indonesia dengan dialog dewasa",
    "Video Indonesia dengan percakapan dewasa"
  ],
  "asian-ai": [
    "Video AI Asia",
    "Video AI Asia"
  ],
  "chinese-ai-drama": [
    "Drama AI Cina",
    "Drama AI Tiongkok"
  ]
};

export function collectionHeading(slug: string, language: PublicLanguage, original: string) {
  if (language === "en") return original;
  return collectionNames[slug]?.[language === "ms" ? 0 : 1] ?? original;
}

export function collectionIntro(label: string, language: PublicLanguage) {
  return language === "ms" ? `Terokai koleksi ${label}. Pilih tajuk untuk melihat butiran dan menonton. Khas untuk dewasa.` :
    language === "id" ? `Jelajahi koleksi ${label}. Pilih judul untuk melihat detail dan menonton. Khusus dewasa.` :
    `Browse the ${label} collection. Choose a title to see details and watch. Adults only.`;
}
