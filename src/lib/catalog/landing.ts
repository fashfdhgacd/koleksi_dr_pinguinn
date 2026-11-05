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
/** Videos on one crawlable /cari page. */
export const LANDING_PAGE_SIZE = 24;
/** @deprecated alias so older imports keep compiling */
export const LANDING_LIMIT = LANDING_PAGE_SIZE;
/** Category pool scanned for a landing page (sorted by views, then paginated). */
export const LANDING_POOL = 144;
/** Pages 1..this stay indexable; deeper /cari pages are noindex,follow. */
export const LANDING_INDEX_PAGES = 5;

/**
 * Genre landings use only these sources (already in our catalog). The Videy landing is the
 * exception: it is a source page, not a genre page.
 */
export const OWN_CATALOG_SOURCES = new Set(["IndoAV", "UserBokep"]);

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
      "Bokep Videy Indo terpopuler: video paling banyak ditonton, streaming di HP tanpa login. Khusus 18+.",
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
      "Bokep Indo STW dan tante dewasa paling ditonton. Streaming tanpa login, ditambah rutin. Khusus 18+.",
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
      "Threesome Indo dan bokep 3some paling banyak ditonton. Video dewasa bertiga, streaming tanpa login. Khusus 18+.",
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
      "Bokep Indo amatir terpopuler: rekaman rumahan pasangan dewasa, diurutkan dari tayangan. Streaming tanpa login. Khusus 18+.",
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
      "Videy Indo colmek dan video colmek dewasa paling ditonton. Streaming cepat di HP tanpa login. Khusus 18+.",
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
      "Bokep jilbab Indo paling banyak ditonton. Video hijab dewasa, streaming tanpa login. Khusus 18+.",
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
      "Bokep bumil dan video ibu hamil dewasa paling ditonton. Streaming tanpa login dari kategori Hamil. Khusus 18+.",
    intro:
      "Bumil adalah singkatan dari ibu hamil. Halaman ini mengumpulkan video bumil dewasa yang paling banyak ditonton di koleksidrpinguin.com, diambil dari kategori Hamil dan diurutkan dari tayangan terbanyak. Isinya kebanyakan rekaman rumahan pasangan suami istri dewasa dengan suasana santai. Setiap video dikurasi manual dan judul yang tidak pantas disaring sebelum tampil di katalog. Video langsung bisa diputar di browser HP atau laptop tanpa login dan tanpa aplikasi tambahan. Konten ini khusus untuk pengunjung berusia 18 tahun ke atas. Untuk urutan terbaru, buka kategori Hamil lengkap lewat tautan di bawah, lalu simpan alamat situs ini supaya mudah kembali.",
    queries: ["bokep bumil", "video bokep bumil", "bokep bumil viral"],
  },
  {
    slug: "bokep-cewek-malaysia",
    category: "malaysia",
    h1: "Bokep Cewek Malaysia dan Awek Rempit",
    title: "Bokep Cewek Malaysia & Awek Rempit | koleksidrpinguin.com",
    description:
      "Bokep cewek Malaysia, awek melayu, tudung, dan rempit yang paling ditonton. Streaming tanpa VPN, tanpa login. Khusus 18+.",
    intro:
      "Bokep cewek Malaysia sering dicari karena logat Melayu dan gaya awek negeri jiran terasa dekat bagi penonton Indonesia. Halaman ini mengumpulkan video Malaysia dari katalog IndoAV dan UserBokep yang paling banyak ditonton di koleksidrpinguin.com, termasuk judul yang menyebut awek melayu, tudung, atau rempit. Daftar diurutkan dari jumlah tayangan, jadi yang paling disukai ada di atas. Semua pemeran dewasa dan judul yang tidak pantas sudah disaring sebelum tampil. Video diputar langsung di browser HP tanpa VPN dan tanpa daftar akun. Untuk urutan terbaru, buka kategori Malaysia lewat tautan di bawah, lalu simpan alamat situs ini supaya mudah kembali lagi.",
    queries: ["bokep cewek malaysia", "bokep malay rempit", "tudung mesum", "awek melayu"],
  },
  {
    slug: "bokep-indo-ai",
    category: "ai-indo",
    h1: "Bokep Indo AI Paling Banyak Ditonton",
    title: "Bokep Indo AI Paling Ditonton | koleksidrpinguin.com",
    description:
      "Bokep indo AI paling banyak ditonton: video buatan AI berbahasa Indonesia. Streaming di HP tanpa VPN. Khusus 18+.",
    intro:
      "Bokep indo AI adalah video buatan kecerdasan buatan dengan judul dan cerita berbahasa Indonesia, bukan rekaman orang sungguhan. Halaman ini menampilkan yang paling banyak ditonton di koleksidrpinguin.com dari kategori AI Indo, hanya yang sumbernya IndoAV atau UserBokep, diurutkan dari tayangan terbanyak. Gambarnya hasil generate dewasa, jadi tidak ada identitas pribadi di dalamnya. Videonya ringan dibuka di HP dan langsung bisa diputar tanpa VPN, tanpa aplikasi tambahan, dan tanpa login. Kalau ingin seluruh unggahan dalam urutan terbaru, buka kategori AI Indo lewat tautan di bawah. Simpan alamat situs ini supaya koleksi yang sama mudah ditemukan lagi nanti.",
    queries: ["bokep indo ai", "video ai indonesia", "bokep ai indo"],
  },
  {
    slug: "bokep-doggy-indo",
    category: "doggy",
    h1: "Bokep Doggy Style Indo Terpopuler",
    title: "Bokep Doggy Style Indo Terpopuler | koleksidrpinguin.com",
    description:
      "Bokep doggy style Indo paling banyak ditonton, dari amatir sampai yang lebih rapi. Streaming tanpa VPN. Khusus 18+.",
    intro:
      "Doggy style, atau posisi nungging, adalah salah satu gaya yang paling sering diketik orang saat mencari video dewasa. Halaman ini merangkum bokep doggy Indo yang paling banyak ditonton di koleksidrpinguin.com, diambil dari katalog IndoAV dan UserBokep, dari rekaman amatir sampai yang lebih rapi. Urutannya mengikuti jumlah tayangan supaya pilihan pengunjung lain ada di baris pertama. Semua pemeran dewasa dan judul yang tidak pantas sudah disaring. Video langsung diputar di browser tanpa VPN dan tanpa perlu membuat akun, di HP maupun komputer. Urutan terbaru ada di kategori Doggy lewat tautan di bawah halaman ini. Simpan alamat situs supaya gampang kembali.",
    queries: ["bokep doggy", "doggy style indo", "bokep doggy indo"],
  },
  {
    slug: "bokep-live-indo",
    category: "live",
    h1: "Bokep Live Indo Paling Banyak Ditonton",
    title: "Bokep Live Indo Terpopuler | koleksidrpinguin.com",
    description:
      "Bokep live Indo paling banyak ditonton: rekaman siaran yang sudah ada di katalog. Streaming tanpa VPN, tanpa login. Khusus 18+.",
    intro:
      "Bokep live Indo di halaman ini adalah rekaman siaran yang sudah masuk katalog, bukan janji siaran langsung yang masih berjalan. Daftarnya diambil dari kategori Live, hanya video IndoAV dan UserBokep, lalu diurutkan dari tayangan terbanyak di koleksidrpinguin.com. Banyak pengunjung mencari rekaman live karena suasananya terasa lebih spontan dibanding produksi studio. Semua pemeran dewasa dan setiap judul diperiksa sebelum tampil. Putar langsung di browser HP tanpa VPN dan tanpa daftar akun. Kalau ingin yang paling baru, buka kategori Live lewat tautan di bawah. Simpan alamat situs ini supaya mudah membuka koleksi yang sama lain kali.",
    queries: ["bokep live indo", "rekaman live indo", "bokep live"],
  },
  {
    slug: "bokep-selingkuh",
    category: "selingkuh",
    h1: "Bokep Selingkuh Indo Terpopuler",
    title: "Bokep Selingkuh Indo Terpopuler | koleksidrpinguin.com",
    description:
      "Bokep selingkuh Indo paling banyak ditonton dari katalog sendiri. Streaming di HP tanpa VPN dan tanpa login. Khusus 18+.",
    intro:
      "Bokep selingkuh Indo mengumpulkan cerita pasangan dewasa yang merekam pertemuan di luar rumah, dari obrolan santai sampai adegan yang lebih terus terang. Halaman ini hanya memakai video IndoAV dan UserBokep yang sudah ada di koleksidrpinguin.com, diurutkan dari jumlah tayangan supaya yang paling sering diputar ada di atas. Bukan cuplikan yang diambil dari situs lain. Semua pemeran dewasa dan judul yang tidak pantas disaring lebih dulu. Video bisa dibuka di HP tanpa VPN dan tanpa membuat akun. Untuk daftar terbaru, buka kategori Selingkuh lewat tautan di bawah halaman ini, lalu simpan alamat situs supaya gampang kembali.",
    queries: ["bokep selingkuh", "bokep selingkuh indo", "video selingkuh"],
  },
  {
    slug: "bokep-istri-indo",
    category: "istri",
    h1: "Bokep Istri Indo Paling Banyak Ditonton",
    title: "Bokep Istri Indo Terpopuler | koleksidrpinguin.com",
    description:
      "Bokep istri Indo paling banyak ditonton dari katalog IndoAV dan UserBokep. Streaming tanpa VPN. Khusus 18+.",
    intro:
      "Bokep istri Indo di sini adalah rekaman pasangan dewasa yang sudah dikurasi di koleksidrpinguin.com, bukan nama orang sungguhan yang kami promosikan. Halaman ini menampilkan video kategori Istri dari IndoAV dan UserBokep yang paling banyak ditonton, diurutkan dari tayangan. Suasananya kebanyakan rumahan: kamar, obrolan, dan gaya yang apa adanya. Setiap judul diperiksa sebelum tampil dan pemerannya dewasa. Putar langsung di browser tanpa VPN, tanpa aplikasi, dan tanpa login. Urutan terbaru ada di kategori Istri lewat tautan di bawah. Simpan alamat situs ini supaya koleksi yang sama mudah dibuka lagi.",
    queries: ["bokep istri", "bokep istri indo", "video istri"],
  },
  {
    slug: "bokep-kosan",
    category: "kosan",
    h1: "Bokep Kosan Indo Terpopuler",
    title: "Bokep Kosan Indo Terpopuler | koleksidrpinguin.com",
    description:
      "Bokep kosan Indo paling banyak ditonton. Rekaman kamar kos dewasa, streaming tanpa VPN dan tanpa login. Khusus 18+.",
    intro:
      "Bokep kosan Indo memakai latar kamar kos yang sempit dan rekaman yang terasa dekat, itu sebabnya pencarian ini ramai. Halaman ini mengumpulkan video kategori Kosan dari IndoAV dan UserBokep yang paling banyak ditonton di koleksidrpinguin.com. Urutannya dari jumlah tayangan, bukan dari tanggal unggah, supaya yang paling disukai muncul lebih dulu. Semua pemeran dewasa. Judul yang tidak pantas tidak ikut ditampilkan. Video langsung diputar di HP tanpa VPN dan tanpa daftar akun. Kalau ingin lihat yang baru masuk, buka kategori Kosan lewat tautan di bawah halaman ini. Simpan alamat situs supaya mudah kembali.",
    queries: ["bokep kosan", "bokep kosan indo", "video kosan"],
  },
  {
    slug: "bokep-hotel-oyo",
    category: "hotel",
    h1: "Bokep Hotel dan OYO Indo",
    title: "Bokep Hotel & OYO Indo Terpopuler | koleksidrpinguin.com",
    description:
      "Bokep hotel dan OYO Indo paling banyak ditonton. Rekaman kamar dewasa, streaming tanpa VPN. Khusus 18+.",
    intro:
      "Bokep hotel dan OYO Indo biasanya rekaman pasangan dewasa di kamar yang disewa semalam, dengan obrolan yang masih terdengar natural. Halaman ini mengambil video kategori Hotel dari katalog IndoAV dan UserBokep di koleksidrpinguin.com, lalu mengurutkannya dari tayangan terbanyak. Tidak ada cuplikan yang disalin dari situs lain. Setiap judul sudah disaring dan semua pemeran dewasa. Streaming langsung di browser HP maupun laptop, tanpa VPN dan tanpa perlu membuat akun. Untuk urutan terbaru, buka kategori Hotel lewat tautan di bawah. Simpan alamat situs ini supaya gampang menemukan daftar yang sama lagi.",
    queries: ["bokep hotel", "bokep oyo", "bokep hotel indo"],
  },
  {
    slug: "bokep-chindo",
    category: "chindo",
    h1: "Bokep Chindo Paling Banyak Ditonton",
    title: "Bokep Chindo Terpopuler | koleksidrpinguin.com",
    description:
      "Bokep chindo paling banyak ditonton dari katalog sendiri. Streaming di HP tanpa VPN, tanpa login. Khusus 18+.",
    intro:
      "Bokep chindo adalah sebutan untuk video dewasa dengan pemeran keturunan Tionghoa Indonesia yang sudah berusia dewasa. Halaman ini menampilkan yang paling banyak ditonton di koleksidrpinguin.com, hanya dari IndoAV dan UserBokep, diurutkan menurut tayangan. Daftarnya beda dari halaman kategori karena yang diutamakan adalah yang paling sering diputar, bukan yang paling baru. Judul yang tidak pantas disaring sebelum tampil. Video bisa dibuka di HP tanpa VPN, tanpa aplikasi tambahan, dan tanpa login. Urutan terbaru tetap ada di kategori Chindo lewat tautan di bawah. Simpan alamat situs supaya koleksi ini mudah dibuka kembali.",
    queries: ["bokep chindo", "video chindo", "bokep chindo indo"],
  },
  {
    slug: "bokep-open-bo",
    category: "open-bo",
    h1: "Bokep Open BO Indo Terpopuler",
    title: "Bokep Open BO Indo Terpopuler | koleksidrpinguin.com",
    description:
      "Bokep open BO Indo paling banyak ditonton, termasuk yang menyebut michat. Streaming tanpa VPN. Khusus 18+.",
    intro:
      "Open BO adalah istilah yang dipakai pengunjung untuk video dewasa hasil janji temu yang memang sudah disepakati orang dewasa. Halaman ini mengumpulkan yang paling banyak ditonton di kategori Open BO koleksidrpinguin.com, terbatas pada video IndoAV dan UserBokep yang sudah ada di katalog. Urutan mengikuti jumlah tayangan. Tidak ada nama orang yang kami tambahkan sendiri, dan judul yang tidak pantas tidak ikut. Putar langsung di browser tanpa VPN dan tanpa daftar akun, di HP maupun komputer. Daftar terbaru ada di kategori Open BO lewat tautan di bawah. Simpan alamat situs ini supaya mudah kembali.",
    queries: ["bokep open bo", "bokep michat", "open bo indo"],
  },
  {
    slug: "bokep-ojol",
    category: "ojol",
    h1: "Bokep Ojol Indo Paling Banyak Ditonton",
    title: "Bokep Ojol Indo Terpopuler | koleksidrpinguin.com",
    description:
      "Bokep ojol Indo paling banyak ditonton dari katalog sendiri. Streaming di HP tanpa VPN dan tanpa login. Khusus 18+.",
    intro:
      "Bokep ojol Indo biasanya berlatar perjalanan atau order yang berakhir di rekaman pasangan dewasa. Halaman ini memuat video kategori Ojol dari IndoAV dan UserBokep yang paling banyak ditonton di koleksidrpinguin.com. Daftar diurutkan dari tayangan, jadi yang paling sering diputar ada di awal. Semua pemeran dewasa dan judul yang tidak pantas sudah dikeluarkan. Video tidak diambil dari situs lain; semuanya sudah ada di katalog ini. Streaming langsung di HP tanpa VPN dan tanpa perlu login. Untuk unggahan yang lebih baru, buka kategori Ojol lewat tautan di bawah, lalu simpan alamat situs supaya gampang kembali.",
    queries: ["bokep ojol", "bokep ojol indo", "video ojol"],
  },
  {
    slug: "bokep-vcs",
    category: "vcs",
    h1: "Video VCS Indo Paling Banyak Ditonton",
    title: "Video VCS Indo Terpopuler | koleksidrpinguin.com",
    description:
      "Video VCS Indo paling banyak ditonton: rekaman video call dewasa. Streaming tanpa VPN, tanpa login. Khusus 18+.",
    intro:
      "VCS adalah singkatan yang dipakai orang untuk video call dewasa. Halaman ini mengumpulkan rekaman VCS Indo yang paling banyak ditonton di koleksidrpinguin.com, hanya dari sumber IndoAV dan UserBokep yang sudah tersimpan di katalog. Urutannya dari jumlah tayangan, bukan dari tanggal masuk. Layar HP, obrolan, dan gaya amatir adalah ciri yang paling sering muncul di judul. Semua pemeran dewasa dan judul yang tidak pantas disaring. Putar langsung di browser tanpa VPN dan tanpa daftar akun. Urutan terbaru ada di kategori VCS lewat tautan di bawah. Simpan alamat situs ini supaya mudah membuka daftar yang sama lagi.",
    queries: ["bokep vcs", "video vcs indo", "vcs indo"],
  },
];

export function findLanding(slug: string | undefined | null): LandingDef | undefined {
  const s = String(slug || "").trim().toLowerCase();
  return LANDINGS.find((l) => l.slug === s);
}

/** First genre landing for a category slug, used as the /cari link on a watch page. */
export function landingForCategory(category: string | undefined | null): LandingDef | undefined {
  const s = String(category || "").trim().toLowerCase();
  if (!s) return undefined;
  return LANDINGS.find((l) => l.category === s);
}

export function landingTitleOk(title: string, match?: RegExp): boolean {
  const t = String(title || "");
  if (!t || hasBannedWord(t)) return false;
  if (match && !match.test(t)) return false;
  return true;
}

/**
 * A card may appear on /cari. Genre pages stay on IndoAV and UserBokep already in the catalog.
 * The Videy landing is the one source page and does not pull other hosts.
 * Blocklist ids are rejected by the caller (isSeoBlockedId), not by title school-words on JAV.
 */
export function acceptLandingCard(
  card: { title?: string; creator?: string | null; category?: string },
  def: Pick<LandingDef, "category" | "match">,
): boolean {
  if (!landingTitleOk(String(card.title || ""), def.match)) return false;
  if (def.category === "videy") return card.category === "videy" || String(card.creator || "") === "Videy";
  return OWN_CATALOG_SOURCES.has(String(card.creator || ""));
}

export function wordCount(text: string): number {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}
