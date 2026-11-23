import { type PublicLanguage } from "./public-locale";
import { translate } from "./public-ui";

const sections: Record<string, [string, string]> = {
  kategori: ["Kategori video", "Video categories"], cari: ["Carian popular", "Popular searches"],
  genre: ["Genre video", "Video genres"], tentang: ["Tentang kami", "About us"], kontak: ["Hubungi kami", "Contact us"],
  privasi: ["Dasar privasi", "Privacy policy"], syarat: ["Terma penggunaan", "Terms of use"],
  laporan: ["Laporan ketelusan", "Transparency report"], teman: ["Rakan laman", "Partner sites"],
  kirim: ["Hantar video", "Submit a video"], dmca: ["Hak cipta dan permohonan penurunan", "Copyright and removal requests"],
  "2257": ["Pernyataan 2257", "2257 statement"],
};

export function pageCopy(path: string, language: PublicLanguage, originalTitle: string, query?: string | null) {
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
    description = ms ? `Terokai koleksi ${label} dan pilih video untuk ditonton. Untuk penonton 18 tahun ke atas.` : `Browse the ${label} collection and choose a video to watch. For viewers aged 18 and over.`;
  } else if (sections[section]) {
    description = ms ? `${label} — maklumat dan pautan di ${brand}.` : `${label} — information and links on ${brand}.`;
  }
  const page = /\/halaman\/(\d+)$/.exec(path)?.[1];
  if (page) label += ms ? ` · Halaman ${page}` : ` · Page ${page}`;
  return { label, title: brand && brand !== label ? label + " | " + brand : label, description };
}

export function collectionLabel(slug: string, language: PublicLanguage) {
  const key = slug.replace(/-/g, " ");
  return translate(language, key[0]?.toUpperCase() + key.slice(1));
}
