import { CATEGORIES } from "./categories";

export type CategorySeo = { title: string; h1: string; description: string; intro: string };

const YEAR = 2026;
const BRAND = "Koleksi Dr. Pinguin";
/** Suffix judul tab/SERP: domain (keputusan pemilik). */
const TITLE_SUFFIX = "koleksidrpinguin.com";

const COPY: Record<string, { h1: string; intro: string }> = {
  jav: { h1: "JAV Sub Indo Terbaru", intro: "Kumpulan JAV sub Indo dan film dewasa Jepang pilihan yang diperbarui rutin. Semua video bisa ditonton langsung di HP maupun desktop tanpa unduh. Khusus pengunjung 18 tahun ke atas." },
  "ai-plus": { h1: "Bokep AI+ Terbaru", intro: "Koleksi video AI+ pilihan dengan kualitas streaming yang stabil. Daftar ini diperbarui berkala, jadi selalu ada judul baru untuk ditonton. Khusus pengunjung 18 tahun ke atas." },
  jilbab: { h1: "Bokep Jilbab Terbaru", intro: "Kumpulan bokep jilbab Indonesia terbaru dan paling banyak dicari. Semua video bisa diputar langsung dari HP tanpa aplikasi tambahan. Khusus pengunjung 18 tahun ke atas." },
  tante: { h1: "Bokep Tante Indo Terbaru", intro: "Koleksi video tante Indonesia pilihan, diperbarui berkala setiap pekan. Tonton langsung secara streaming di HP maupun desktop. Khusus pengunjung 18 tahun ke atas." },
  amatir: { h1: "Bokep Amatir Indo Terbaru", intro: "Kumpulan video amatir Indonesia rekaman pribadi dan viral yang paling banyak dicari. Semua bisa diputar langsung tanpa unduh. Khusus pengunjung 18 tahun ke atas." },
  viral: { h1: "Bokep Indo Viral Terbaru", intro: "Video Indo viral yang sedang ramai dibicarakan, dikumpulkan di satu tempat dan diperbarui setiap hari. Tonton langsung di HP tanpa ribet. Khusus pengunjung 18 tahun ke atas." },
  percakapan: { h1: "Bokep Indo Percakapan Jelas", intro: "Koleksi video Indonesia dengan percakapan dan suara yang jelas. Daftar ini terus bertambah dan bisa diputar langsung dari HP. Khusus pengunjung 18 tahun ke atas." },
  kosan: { h1: "Bokep Kosan Indo Terbaru", intro: "Kumpulan video kosan Indonesia pilihan yang diperbarui berkala. Semua video bisa ditonton secara streaming tanpa unduh. Khusus pengunjung 18 tahun ke atas." },
  colmek: { h1: "Video Colmek Indo Terbaru", intro: "Koleksi video colmek Indonesia pilihan dengan kualitas streaming yang lancar. Daftar diperbarui rutin dan bisa dibuka di HP maupun desktop. Khusus pengunjung 18 tahun ke atas." },
  istri: { h1: "Bokep Istri Indo Terbaru", intro: "Kumpulan video istri Indonesia yang paling banyak dicari, diperbarui berkala. Tonton langsung tanpa aplikasi tambahan. Khusus pengunjung 18 tahun ke atas." },
  live: { h1: "Bokep Live Indo Terbaru", intro: "Rekaman siaran live Indonesia pilihan yang dikumpulkan di satu tempat. Video baru ditambahkan rutin dan bisa diputar langsung di HP. Khusus pengunjung 18 tahun ke atas." },
  doggy: { h1: "Bokep Doggy Indo Terbaru", intro: "Koleksi video gaya doggy pilihan dari Indonesia dan Asia. Semua video bisa ditonton secara streaming tanpa unduh. Khusus pengunjung 18 tahun ke atas." },
  "open-bo": { h1: "Bokep Open BO Indo Terbaru", intro: "Kumpulan video open BO Indonesia yang diperbarui berkala. Tonton langsung di HP maupun desktop dengan streaming yang lancar. Khusus pengunjung 18 tahun ke atas." },
  malaysia: { h1: "Bokep Malaysia Terbaru", intro: "Koleksi video Malaysia dan Melayu pilihan yang paling banyak dicari. Daftar diperbarui rutin dan bisa diputar langsung dari HP. Khusus pengunjung 18 tahun ke atas." },
  chindo: { h1: "Bokep Chindo Terbaru", intro: "Kumpulan video Chindo pilihan dengan kualitas streaming yang stabil. Video baru ditambahkan berkala, tonton langsung tanpa unduh. Khusus pengunjung 18 tahun ke atas." },
  gangbang: { h1: "Bokep Threesome & Gangbang Terbaru", intro: "Koleksi video threesome dan gangbang pilihan dari Asia dan Indonesia. Semua bisa ditonton langsung di HP maupun desktop. Khusus pengunjung 18 tahun ke atas." },
  selingkuh: { h1: "Bokep Selingkuh Indo Terbaru", intro: "Kumpulan video selingkuh dan binor Indonesia yang paling banyak dicari, diperbarui berkala. Tonton langsung di HP tanpa unduh. Khusus pengunjung 18 tahun ke atas." },
  barat: { h1: "Bokep Bule & Barat Terbaru", intro: "Koleksi video bule dan barat pilihan, termasuk kolaborasi bule dengan cewek Asia. Semua bisa diputar langsung secara streaming. Khusus pengunjung 18 tahun ke atas." },
  mahasiswi: { h1: "Bokep Mahasiswi Indo Terbaru", intro: "Kumpulan video mahasiswi dan anak kampus (dewasa) Indonesia pilihan yang diperbarui rutin. Tonton langsung di HP maupun desktop. Khusus pengunjung 18 tahun ke atas." },
  sepong: { h1: "Bokep Sepong Indo Terbaru", intro: "Koleksi video sepong dan oral pilihan dari Indonesia dan Asia. Daftar diperbarui berkala dan bisa diputar langsung tanpa unduh. Khusus pengunjung 18 tahun ke atas." },
  tobrut: { h1: "Bokep Tobrut Indo Terbaru", intro: "Kumpulan video cewek tobrut dan toge Indonesia yang paling banyak dicari. Semua video bisa ditonton langsung dari HP. Khusus pengunjung 18 tahun ke atas." },
  selebgram: { h1: "Bokep Selebgram & Tiktokers Terbaru", intro: "Koleksi video selebgram dan tiktokers Indonesia yang sedang ramai, diperbarui berkala. Tonton langsung secara streaming tanpa aplikasi tambahan. Khusus pengunjung 18 tahun ke atas." },
  outdoor: { h1: "Bokep Outdoor Indo Terbaru", intro: "Kumpulan video outdoor Indonesia: di mobil, kebun, hutan, sampai tempat terbuka lainnya. Semua bisa diputar langsung di HP. Khusus pengunjung 18 tahun ke atas." },
  hotel: { h1: "Bokep Hotel Indo Terbaru", intro: "Koleksi video di hotel, OYO, dan penginapan dari Indonesia yang diperbarui rutin. Tonton langsung tanpa unduh di HP maupun desktop. Khusus pengunjung 18 tahun ke atas." },
  "kamar-mandi": { h1: "Bokep Kamar Mandi Indo Terbaru", intro: "Kumpulan video kamar mandi dan toilet pilihan dari Indonesia. Daftar terus bertambah dan bisa diputar langsung dari HP. Khusus pengunjung 18 tahun ke atas." },
  wot: { h1: "Bokep Goyang WOT Indo Terbaru", intro: "Koleksi video goyang WOT (woman on top) pilihan dari Indonesia. Semua video bisa ditonton secara streaming tanpa unduh. Khusus pengunjung 18 tahun ke atas." },
  "crot-dalam": { h1: "Bokep Crot Dalam Indo Terbaru", intro: "Kumpulan video crot dalam (creampie) Indonesia dan Asia yang diperbarui berkala. Tonton langsung di HP maupun desktop. Khusus pengunjung 18 tahun ke atas." },
  hamil: { h1: "Bokep Hamil Indo Terbaru", intro: "Koleksi video bumil dan istri hamil Indonesia pilihan. Daftar diperbarui rutin dan bisa diputar langsung tanpa aplikasi tambahan. Khusus pengunjung 18 tahun ke atas." },
  ojol: { h1: "Bokep Ojol Indo Terbaru", intro: "Kumpulan video ojol Indonesia yang paling banyak dicari, dari prank sampai order fiktif. Tonton langsung secara streaming di HP. Khusus pengunjung 18 tahun ke atas." },
  // No visible intro on this page (owner's choice); the meta description is built below.
  videy: { h1: "drpinguin videy", intro: "" },
  lainnya: { h1: "Bokep Indo Lainnya", intro: "Kumpulan video dewasa lain yang belum masuk kategori utama, diperbarui berkala. Tonton langsung secara streaming tanpa unduh. Khusus pengunjung 18 tahun ke atas." },
};

export function categorySeo(slug: string): CategorySeo {
  const cat = CATEGORIES.find((c) => c.slug === slug);
  const label = cat?.label || "Video";
  const c = COPY[slug] || { h1: `Bokep ${label} Terbaru`, intro: `Koleksi video ${label} pilihan yang diperbarui berkala. Tonton langsung di HP maupun desktop. Khusus pengunjung 18 tahun ke atas.` };
  const title = `${c.h1} ${YEAR} | ${TITLE_SUFFIX}`;
  let description = c.intro.replace(/\s*Khusus pengunjung 18 tahun ke atas\.$/, "");
  description = description
    ? `${c.h1} ${YEAR} di ${BRAND}. ${description}`
    : `Video ${c.h1} di ${BRAND}, diputar langsung di HP maupun desktop.`;
  if (description.length > 160) description = `${description.slice(0, 157).replace(/\s+\S*$/, "")}…`;
  return { title, h1: c.h1, description, intro: c.intro };
}

/** Cari slug kategori dari slug atau label tampilan (mis. "AI+"). */
export function categorySlugFor(labelOrSlug?: string | null): string | undefined {
  const k = String(labelOrSlug || "").trim().toLowerCase();
  if (!k) return undefined;
  return CATEGORIES.find((c) => c.slug === k || c.label.toLowerCase() === k)?.slug;
}
