/**
 * Search landing pages /cari/<slug> (growth 2026-11-04).
 *
 * Hand-reviewed allowlist only: every entry comes from a generic Google Search Console query that
 * already brings visitors (workspace GSC export "Kueri", 2026-11), mapped onto an existing category.
 * No person names, no minor-implying words, no non-consent words (see LANDING_BANNED). A page is
 * indexable only while it has at least LANDING_MIN_VIDEOS clean videos; otherwise noindex,follow.
 *
 * Kept free of imports so node --test can load it directly.
 */

export type LandingDef = {
  slug: string;
  /** Existing category slug (src/lib/catalog/categories.ts) the videos come from. */
  category: string;
  /** Optional extra title filter inside the category (case-insensitive). */
  match?: RegExp;
  h1: string;
  title: string;
  description: string;
  /** 80–120 words, Indonesian. */
  intro: string;
  /** GSC queries this page answers (documentation only). */
  queries: string[];
};

/** Minimum clean videos for an indexable landing page. */
export const LANDING_MIN_VIDEOS = 12;
/** Videos shown on one landing page (one page, no pagination). */
export const LANDING_LIMIT = 48;
/** Category pool scanned for a landing page (sorted by views, then cut to LANDING_LIMIT). */
export const LANDING_POOL = 144;

/**
 * Words a landing page (slug, H1, title, intro) and its video titles must never contain:
 * minor-implying terms and non-consent terms. Matched on word boundaries, case-insensitive.
 */
export const LANDING_BANNED =
  /\b(abg|smp|sma|smk|sd|bocil|bocah|pelajar|siswi|siswa|sekolah|seragam|anak|dibawah\s*umur|under\s*age|underage|loli|lolita|remaja|perawan|bocor|bocoran|kesebar|tersebar|direkam|rekam\s*diam|skandal|paksa|dipaksa|diperkosa|perkosa|mabuk|tidur|pingsan|ngintip|intip|hidden\s*cam|spy\s*cam)\b/i;

export function hasBannedWord(text: string): boolean {
  return LANDING_BANNED.test(String(text || ""));
}

export const LANDINGS: LandingDef[] = [
  {
    slug: "bokep-videy-indo",
    category: "videy",
    h1: "Bokep Videy Indo Pilihan Terpopuler",
    title: "Bokep Videy Indo Terpopuler | koleksidrpinguin.com",
    description:
      "Kumpulan video Videy Indo 18+ paling banyak ditonton di koleksidrpinguin.com. Streaming cepat tanpa login, diperbarui setiap hari.",
    intro:
      "Halaman ini mengumpulkan video Videy Indo yang paling sering ditonton pengunjung koleksidrpinguin.com. Banyak orang mencari bokep Videy Indo karena videonya ringan dibuka di HP dan langsung bisa diputar tanpa aplikasi tambahan. Di sini daftar diurutkan dari jumlah tayangan terbanyak, jadi video yang paling disukai muncul paling atas. Semua video berasal dari katalog Videy kami yang dikurasi manual, dengan judul yang sudah dirapikan dan video rusak yang dibuang. Konten khusus dewasa berusia 18 tahun ke atas. Kalau ingin melihat urutan terbaru, buka kategori Videy lengkap lewat tautan di bawah, lalu simpan alamat situs ini supaya mudah kembali.",
    queries: ["bokep videy indo", "videy indo bokep", "videy bokep indo", "videy indo"],
  },
  {
    slug: "bokep-indo-stw",
    category: "tante",
    h1: "Bokep Indo STW dan Tante Pilihan",
    title: "Bokep Indo STW & Tante Terpopuler | koleksidrpinguin.com",
    description:
      "Video Indo STW dan tante dewasa paling banyak ditonton di koleksidrpinguin.com. Streaming 18+ tanpa login, diperbarui rutin.",
    intro:
      "STW adalah singkatan populer untuk setengah tua, sebutan bagi perempuan dewasa yang matang. Halaman ini berisi video Indo STW dan tante yang paling banyak ditonton di koleksidrpinguin.com, diurutkan dari tayangan terbanyak. Semua pemeran adalah orang dewasa, dan setiap judul sudah diperiksa sebelum tampil di katalog. Videonya bisa langsung diputar di browser HP maupun laptop tanpa perlu daftar akun. Kalau kamu suka suasana rumahan yang santai dan pemeran yang lebih berpengalaman, mulai saja dari video teratas. Untuk urutan terbaru, buka kategori Tante lengkap lewat tautan di bawah, dan simpan alamat situs ini supaya gampang kembali lagi nanti.",
    queries: ["bokep indo stw", "bokepindostw", "bokep stw", "indoav stw"],
  },
  {
    slug: "threesome-indo",
    category: "gangbang",
    h1: "Threesome Indo dan 3some Pilihan",
    title: "Threesome Indo & 3some Terpopuler | koleksidrpinguin.com",
    description:
      "Video threesome Indo dan 3some dewasa paling banyak ditonton di koleksidrpinguin.com. Streaming 18+ cepat tanpa login.",
    intro:
      "Halaman threesome Indo ini mengumpulkan video bertiga dan 3some dari kategori Threesome & Gangbang yang paling banyak ditonton pengunjung koleksidrpinguin.com. Daftarnya diurutkan dari jumlah tayangan, jadi yang paling populer selalu ada di baris pertama. Setiap video dikurasi manual, semua pemeran dewasa, dan judul yang tidak pantas sudah disaring sebelum masuk katalog. Video bisa diputar langsung di browser tanpa aplikasi dan tanpa login, baik di HP maupun komputer. Kalau ingin melihat semua video dalam urutan terbaru, buka kategori lengkapnya lewat tautan di bawah halaman ini. Jangan lupa simpan alamat situs supaya mudah menemukan koleksi ini lagi.",
    queries: ["threesome indo", "bokep 3some", "bokep indo 3some"],
  },
  {
    slug: "bokep-indo-amatir",
    category: "amatir",
    h1: "Bokep Indo Amatir Paling Banyak Ditonton",
    title: "Bokep Indo Amatir Terpopuler | koleksidrpinguin.com",
    description:
      "Video Indo amatir 18+ paling populer di koleksidrpinguin.com: rekaman rumahan pasangan dewasa, streaming cepat tanpa login.",
    intro:
      "Video amatir Indo selalu jadi pilihan karena terasa lebih natural dibanding produksi studio. Halaman ini merangkum video amatir yang paling banyak ditonton di koleksidrpinguin.com, diurutkan dari jumlah tayangan terbanyak. Isinya rekaman rumahan pasangan dewasa dengan gaya apa adanya, dari kamar kos sampai kamar hotel. Semua video sudah dikurasi manual dan judul yang tidak pantas disaring lebih dulu. Konten khusus untuk pengunjung berusia 18 tahun ke atas. Video bisa diputar langsung di browser tanpa login. Untuk melihat ribuan video amatir lain dalam urutan terbaru, buka kategori Amatir lengkap lewat tautan di bawah ini.",
    queries: ["bokep indo amatir", "bokep amatir", "bokep amatir indo"],
  },
  {
    slug: "videy-indo-colmek",
    category: "colmek",
    h1: "Videy Indo Colmek Pilihan Terpopuler",
    title: "Videy Indo Colmek Terpopuler | koleksidrpinguin.com",
    description:
      "Video colmek Indo dewasa paling banyak ditonton di koleksidrpinguin.com. Streaming 18+ cepat di HP, tanpa login.",
    intro:
      "Colmek adalah istilah populer untuk video solo perempuan dewasa yang memuaskan diri sendiri. Halaman ini mengumpulkan video colmek Indo yang paling banyak ditonton di koleksidrpinguin.com, termasuk yang dulu banyak beredar di Videy, diurutkan dari tayangan terbanyak. Semua pemeran dewasa dan setiap judul diperiksa sebelum tampil. Videonya ringan dan langsung bisa diputar di browser HP tanpa aplikasi tambahan maupun pendaftaran akun. Mulai saja dari video paling atas kalau ingin melihat yang paling disukai pengunjung lain. Untuk urutan terbaru, buka kategori Colmek lengkap lewat tautan di bawah, lalu simpan alamat situs ini supaya mudah kembali.",
    queries: ["videy indo colmek", "stw colmek", "bule colmek"],
  },
  {
    slug: "bokep-jilbab-indo",
    category: "jilbab",
    h1: "Bokep Jilbab Indo Paling Banyak Ditonton",
    title: "Bokep Jilbab Indo Terpopuler | koleksidrpinguin.com",
    description:
      "Video jilbab Indo dewasa paling populer di koleksidrpinguin.com. Streaming 18+ tanpa login, dikurasi dan diperbarui rutin.",
    intro:
      "Halaman ini berisi video jilbab Indo yang paling banyak ditonton di koleksidrpinguin.com, diurutkan dari jumlah tayangan terbanyak sehingga yang paling populer tampil lebih dulu. Semua pemeran adalah perempuan dewasa, dan setiap judul sudah disaring dari kata yang tidak pantas sebelum masuk katalog. Pilihannya beragam, mulai dari rekaman rumahan pasangan sampai video amatir di kamar kos. Video bisa diputar langsung di browser HP maupun laptop tanpa perlu membuat akun. Konten khusus untuk pengunjung 18 tahun ke atas. Kalau ingin melihat semua video dalam urutan terbaru, buka kategori Jilbab lengkap lewat tautan di bawah halaman ini.",
    queries: ["jilbab threesome bokep", "bokep jilbab indo"],
  },
  {
    slug: "bokep-bumil",
    category: "hamil",
    h1: "Bokep Bumil Indo Pilihan",
    title: "Bokep Bumil Indo Terpopuler | koleksidrpinguin.com",
    description:
      "Video bumil (ibu hamil) dewasa paling banyak ditonton di koleksidrpinguin.com. Streaming 18+ tanpa login.",
    intro:
      "Bumil adalah singkatan dari ibu hamil. Halaman ini mengumpulkan video bumil dewasa yang paling banyak ditonton di koleksidrpinguin.com, diambil dari kategori Hamil dan diurutkan dari tayangan terbanyak. Isinya kebanyakan rekaman rumahan pasangan suami istri dewasa dengan suasana santai. Setiap video dikurasi manual dan judul yang tidak pantas disaring sebelum tampil di katalog. Video langsung bisa diputar di browser HP atau laptop tanpa login dan tanpa aplikasi tambahan. Konten ini khusus untuk pengunjung berusia 18 tahun ke atas. Untuk urutan terbaru, buka kategori Hamil lengkap lewat tautan di bawah, lalu simpan alamat situs ini supaya mudah kembali.",
    queries: ["bokep bumil", "video bokep bumil", "bokep bumil viral"],
  },
];

export function findLanding(slug: string | undefined | null): LandingDef | undefined {
  const s = String(slug || "").trim().toLowerCase();
  return LANDINGS.find((l) => l.slug === s);
}

export function wordCount(text: string): number {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}
