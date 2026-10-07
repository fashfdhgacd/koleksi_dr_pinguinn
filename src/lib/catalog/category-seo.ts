import { CATEGORIES } from "./categories";

export type CategorySeo = { title: string; h1: string; description: string; intro: string };

const YEAR = 2026;
const BRAND = "Koleksi Dr. Pinguin";

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
  gangbang: { h1: "Bokep Gangbang Terbaru", intro: "Koleksi video gangbang pilihan dari Asia dan Indonesia. Semua bisa ditonton langsung di HP maupun desktop. Khusus pengunjung 18 tahun ke atas." },
  lainnya: { h1: "Bokep Indo Lainnya", intro: "Kumpulan video dewasa lain yang belum masuk kategori utama, diperbarui berkala. Tonton langsung secara streaming tanpa unduh. Khusus pengunjung 18 tahun ke atas." },
};

export function categorySeo(slug: string): CategorySeo {
  const cat = CATEGORIES.find((c) => c.slug === slug);
  const label = cat?.label || "Video";
  const c = COPY[slug] || { h1: `Bokep ${label} Terbaru`, intro: `Koleksi video ${label} pilihan yang diperbarui berkala. Tonton langsung di HP maupun desktop. Khusus pengunjung 18 tahun ke atas.` };
  const title = `${c.h1} ${YEAR} – ${BRAND}`;
  let description = c.intro.replace(/\s*Khusus pengunjung 18 tahun ke atas\.$/, "");
  description = `${c.h1} ${YEAR} di ${BRAND}. ${description}`;
  if (description.length > 160) description = `${description.slice(0, 157).replace(/\s+\S*$/, "")}…`;
  return { title, h1: c.h1, description, intro: c.intro };
}

/** Cari slug kategori dari slug atau label tampilan (mis. "AI+"). */
export function categorySlugFor(labelOrSlug?: string | null): string | undefined {
  const k = String(labelOrSlug || "").trim().toLowerCase();
  if (!k) return undefined;
  return CATEGORIES.find((c) => c.slug === k || c.label.toLowerCase() === k)?.slug;
}
