import { CATEGORIES } from "./categories";

export type CategorySeo = { title: string; h1: string; description: string; intro: string };

const YEAR = 2026;
const BRAND = "Koleksi Dr. Pinguin";
/** Suffix judul tab/SERP: domain (keputusan pemilik). */
const TITLE_SUFFIX = "koleksidrpinguin.com";

const COPY: Record<string, { h1: string; intro: string; title?: string; description?: string }> = {
  jav: {
    h1: "JAV Sub Indo Terbaru",
    intro: "Nonton JAV sub indo terbaru dan bokep Jepang yang lagi rame, dari artis JAV favorit sampai kode yang paling dicari. Langsung putar di HP tanpa download.",
    title: `JAV Sub Indo Terbaru ${YEAR} - Nonton Bokep Jepang | ${TITLE_SUFFIX}`,
    description: `Nonton JAV sub indo terbaru ${YEAR} dan bokep Jepang yang lagi rame. Cari kode JAV favoritmu, langsung putar di HP tanpa download.`,
  },
  "ai-plus": {
    h1: "Bokep AI Indo Terbaru",
    intro: "Bokep AI indo dan video AI+ terbaru yang lagi banyak dicari, gambar jernih dan streaming lancar. Koleksinya nambah terus tiap minggu.",
    title: `Bokep AI Indo Terbaru ${YEAR} - Video AI+ Viral | ${TITLE_SUFFIX}`,
    description: `Bokep AI indo terbaru ${YEAR} di Koleksi Dr. Pinguin: video AI+ viral yang lagi banyak dicari, jernih dan lancar diputar langsung di HP.`,
  },
  "ai-gay": {
    h1: "Video AI Gay Terbaru",
    intro: "Kumpulan video AI gay buatan AI: adegan sesama pria hasil generate AI, semua pemeran dewasa. Kategori baru, videonya ditambah bertahap.",
    title: `Video AI Gay Terbaru ${YEAR} - Kategori AI GAY | ${TITLE_SUFFIX}`,
    description: `Video AI gay terbaru ${YEAR} di Koleksi Dr. Pinguin: adegan sesama pria buatan AI, pemeran dewasa, langsung putar di HP tanpa download.`,
  },
  jilbab: {
    h1: "Bokep Jilbab Viral Terbaru",
    intro: "Bokep jilbab indo viral yang lagi rame, dari hijab syar'i sampai ukhti yang bikin penasaran. Langsung putar di HP.",
    title: `Bokep Jilbab Viral Terbaru ${YEAR} - Hijab Indo | ${TITLE_SUFFIX}`,
    description: `Bokep jilbab viral terbaru ${YEAR}: video hijab indo yang lagi rame dan paling dicari, langsung tonton di HP tanpa ribet.`,
  },
  tante: {
    h1: "Bokep Tante Indo Viral",
    intro: "Video tante indo, janda dan stw yang lagi viral. Pilihan paling dicari, update terus.",
    title: `Bokep Tante Indo Viral Terbaru ${YEAR} - Janda & STW | ${TITLE_SUFFIX}`,
    description: `Bokep tante indo viral terbaru ${YEAR}: tante, janda dan stw yang lagi rame. Tonton langsung di HP tanpa download.`,
  },
  amatir: {
    h1: "Bokep Indo Amatir Terbaru",
    intro: "Video amatir indo asli, rekaman pribadi dan pasutri yang lagi viral. Langsung tonton tanpa download.",
    title: `Bokep Indo Amatir Terbaru ${YEAR} - Video Viral Asli | ${TITLE_SUFFIX}`,
    description: `Bokep indo amatir terbaru ${YEAR}: rekaman pribadi dan pasutri asli yang lagi viral, langsung putar di HP.`,
  },
  viral: {
    h1: "Bokep Indo Viral Terbaru",
    intro: "Video indo viral yang lagi rame di Twitter, Telegram dan TikTok, dikumpulin di satu tempat. Update tiap ada yang baru.",
    title: `Bokep Indo Viral Terbaru ${YEAR} - Video Viral Hari Ini | ${TITLE_SUFFIX}`,
    description: `Bokep indo viral terbaru ${YEAR}: video viral Twitter, Telegram dan TikTok yang lagi rame hari ini, langsung tonton di HP.`,
  },
  percakapan: {
    h1: "Bokep Indo Percakapan Jelas",
    intro: "Bokep indo dengan obrolan dan suara jelas, dari VCS sampai telpon mesum yang lagi viral.",
    title: `Bokep Indo Percakapan Jelas Terbaru ${YEAR} - VCS Viral | ${TITLE_SUFFIX}`,
    description: `Bokep indo percakapan jelas terbaru ${YEAR}: VCS, video call dan obrolan mesum yang lagi viral, suara jernih.`,
  },
  kosan: {
    h1: "Bokep Kosan Indo Viral",
    intro: "Video mesum di kosan yang lagi viral, rekaman asli anak kos dan pasangan. Langsung putar di HP.",
    title: `Bokep Kosan Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep kosan indo viral terbaru ${YEAR}: rekaman asli anak kos dan pasangan yang lagi rame, tonton langsung di HP.`,
  },
  colmek: {
    h1: "Video Colmek Indo Viral",
    intro: "Video colmek indo yang lagi rame, dari VCS sampai rekaman pribadi. Update terus.",
    title: `Video Colmek Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Video colmek indo viral terbaru ${YEAR}: VCS dan rekaman pribadi yang lagi rame, langsung putar tanpa download.`,
  },
  "teen-18": {
    h1: "Video Teen (18+) Terbaru",
    intro: "Koleksi video Teen (18+): semua pemeran sudah dewasa, 18 tahun ke atas. Update terus.",
    title: `Video Teen (18+) Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Video Teen (18+) terbaru ${YEAR}, semua pemeran 18 tahun ke atas. Langsung putar di HP.`,
  },
  istri: {
    h1: "Bokep Istri Orang Viral",
    intro: "Video istri orang dan binor yang lagi viral, rekaman asli yang paling dicari.",
    title: `Bokep Istri Orang Viral Terbaru ${YEAR} - Binor Indo | ${TITLE_SUFFIX}`,
    description: `Bokep istri orang viral terbaru ${YEAR}: binor dan istri indo yang lagi rame, langsung tonton di HP.`,
  },
  live: {
    h1: "Bokep Live Indo Terbaru",
    intro: "Rekaman live streaming indo yang lagi viral, dari aplikasi live sampai siaran pribadi.",
    title: `Bokep Live Indo Terbaru ${YEAR} - Rekaman Live Viral | ${TITLE_SUFFIX}`,
    description: `Bokep live indo terbaru ${YEAR}: rekaman live streaming yang lagi viral, langsung putar di HP.`,
  },
  doggy: {
    h1: "Bokep Doggy Indo Viral",
    intro: "Video gaya doggy indo dan asia yang paling dicari, langsung putar tanpa ribet.",
    title: `Bokep Doggy Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep doggy indo viral terbaru ${YEAR}: gaya nungging yang paling dicari, tonton langsung di HP.`,
  },
  "open-bo": {
    h1: "Bokep Open BO Indo Viral",
    intro: "Video open BO dan michat yang lagi rame, rekaman asli yang paling banyak dicari.",
    title: `Bokep Open BO Indo Viral Terbaru ${YEAR} - Michat | ${TITLE_SUFFIX}`,
    description: `Bokep open BO indo viral terbaru ${YEAR}: rekaman michat dan BO asli yang lagi rame, langsung tonton di HP.`,
  },
  malaysia: {
    h1: "Bokep Malaysia Viral Terbaru",
    intro: "Video Malaysia dan melayu yang lagi viral, dari tudung sampai amatir.",
    title: `Bokep Malaysia Viral Terbaru ${YEAR} - Video Melayu | ${TITLE_SUFFIX}`,
    description: `Bokep Malaysia viral terbaru ${YEAR}: video melayu dan tudung yang lagi rame, langsung putar di HP.`,
  },
  chindo: {
    h1: "Bokep Chindo Viral Terbaru",
    intro: "Video chindo yang lagi viral dan paling dicari, streaming lancar.",
    title: `Bokep Chindo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep chindo viral terbaru ${YEAR}: video chindo yang lagi rame dan paling dicari, tonton langsung di HP.`,
  },
  gangbang: {
    h1: "Bokep Threesome Indo Viral",
    intro: "Video threesome dan gangbang indo yang lagi rame, rekaman asli dan pilihan.",
    title: `Bokep Threesome & Gangbang Indo Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep threesome dan gangbang indo terbaru ${YEAR}: rekaman asli yang lagi viral, langsung putar di HP.`,
  },
  selingkuh: {
    h1: "Bokep Selingkuh Indo Viral",
    intro: "Video selingkuh yang lagi viral, ketahuan sampai direkam sendiri. Update terus.",
    title: `Bokep Selingkuh Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep selingkuh indo viral terbaru ${YEAR}: video ketahuan selingkuh yang lagi rame, tonton langsung di HP.`,
  },
  barat: {
    h1: "Bokep Bule Terbaru",
    intro: "Video bule dan barat pilihan, termasuk bule sama cewek asia yang lagi dicari.",
    title: `Bokep Bule Terbaru ${YEAR} - Video Barat Pilihan | ${TITLE_SUFFIX}`,
    description: `Bokep bule terbaru ${YEAR}: video barat pilihan dan bule sama cewek asia, langsung putar di HP.`,
  },
  "college-18": {
    h1: "Bokep College (18+) Indo Viral",
    intro: "Video College (18+): mahasiswi dan cewek kuliahan indo yang lagi viral, semua 18 tahun ke atas.",
    title: `Bokep College (18+) Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep College (18+) indo viral terbaru ${YEAR}: mahasiswi dan cewek kuliahan yang lagi rame, tonton langsung di HP.`,
  },
  sepong: {
    h1: "Bokep Sepong Indo Viral",
    intro: "Video sepong indo yang lagi rame dan paling dicari, langsung putar di HP.",
    title: `Bokep Sepong Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep sepong indo viral terbaru ${YEAR}: video oral yang lagi rame dan paling dicari, tonton langsung di HP.`,
  },
  tobrut: {
    h1: "Bokep Tobrut Indo Viral",
    intro: "Video cewek tobrut dan toge indo yang lagi viral, pilihan paling dicari.",
    title: `Bokep Tobrut Indo Viral Terbaru ${YEAR} - Toge | ${TITLE_SUFFIX}`,
    description: `Bokep tobrut indo viral terbaru ${YEAR}: cewek toge yang lagi rame, langsung putar di HP.`,
  },
  selebgram: {
    h1: "Bokep Selebgram & Tiktokers Viral",
    intro: "Video selebgram dan tiktokers indo yang lagi viral dan bikin heboh.",
    title: `Bokep Selebgram Viral Terbaru ${YEAR} - Tiktokers Indo | ${TITLE_SUFFIX}`,
    description: `Bokep selebgram viral terbaru ${YEAR}: tiktokers dan selebgram indo yang lagi heboh, tonton langsung di HP.`,
  },
  outdoor: {
    h1: "Bokep Outdoor Indo Viral",
    intro: "Video mesum outdoor indo yang lagi viral: di mobil, kebun sampai tempat umum.",
    title: `Bokep Outdoor Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep outdoor indo viral terbaru ${YEAR}: di mobil, kebun dan tempat umum yang lagi rame, langsung putar di HP.`,
  },
  hotel: {
    h1: "Bokep Hotel Indo Viral",
    intro: "Video mesum di hotel dan OYO yang lagi viral, rekaman asli yang paling dicari.",
    title: `Bokep Hotel Indo Viral Terbaru ${YEAR} - OYO | ${TITLE_SUFFIX}`,
    description: `Bokep hotel indo viral terbaru ${YEAR}: rekaman di hotel dan OYO yang lagi rame, tonton langsung di HP.`,
  },
  "kamar-mandi": {
    h1: "Bokep Kamar Mandi Indo Viral",
    intro: "Video kamar mandi indo yang lagi viral, rekaman asli yang bikin penasaran.",
    title: `Bokep Kamar Mandi Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep kamar mandi indo viral terbaru ${YEAR}: rekaman asli yang lagi rame, langsung putar di HP.`,
  },
  wot: {
    h1: "Bokep Goyang WOT Indo Viral",
    intro: "Video goyang WOT indo yang lagi rame, goyangan paling dicari.",
    title: `Bokep Goyang WOT Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep goyang WOT indo viral terbaru ${YEAR}: goyangan di atas yang lagi rame, tonton langsung di HP.`,
  },
  "crot-dalam": {
    h1: "Bokep Crot Dalam Indo Viral",
    intro: "Video crot dalam indo dan asia yang paling dicari, update terus.",
    title: `Bokep Crot Dalam Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep crot dalam indo viral terbaru ${YEAR}: video creampie indo dan asia yang paling dicari, langsung putar di HP.`,
  },
  hamil: {
    h1: "Bokep Hamil Indo Viral",
    intro: "Video bumil dan istri hamil indo yang lagi viral, rekaman asli.",
    title: `Bokep Hamil Indo Viral Terbaru ${YEAR} - Bumil | ${TITLE_SUFFIX}`,
    description: `Bokep hamil indo viral terbaru ${YEAR}: bumil dan istri hamil yang lagi rame, tonton langsung di HP.`,
  },
  ojol: {
    h1: "Bokep Ojol Indo Viral",
    intro: "Video ojol indo yang lagi viral, dari prank sampai order yang bikin heboh.",
    title: `Bokep Ojol Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep ojol indo viral terbaru ${YEAR}: video ojol yang lagi heboh, langsung putar di HP.`,
  },
  lainnya: {
    h1: "Bokep Indo Lainnya",
    intro: "Video indo pilihan lain yang belum masuk kategori, tetap seru buat ditonton.",
    title: `Bokep Indo Terbaru ${YEAR} - Video Pilihan Lainnya | ${TITLE_SUFFIX}`,
    description: `Bokep indo terbaru ${YEAR}: video pilihan lain yang tetap seru, langsung tonton di HP tanpa download.`,
  },
  videy: {
    h1: "Video Viral Videy Terbaru",
    intro: "Kumpulan link videy viral dan bokep videy indo terbaru, langsung diputar di sini tanpa buka link satu-satu. Selalu nambah tiap ada video videy baru yang lagi rame.",
    title: `Bokep Videy Indo Viral Terbaru ${YEAR} - Link Videy | ${TITLE_SUFFIX}`,
    description: `Video viral videy terbaru ${YEAR}: kumpulan link videy dan bokep videy indo yang lagi rame, bisa langsung ditonton di HP tanpa buka link satu-satu.`,
  },
  bokep: {
    h1: "Koleksi Dr. Pinguin Bokep",
    intro: "Koleksi pribadi Dr. Pinguin: bokep indo pilihan yang diunggah sendiri, langsung putar di HP tanpa download. Nambah terus tiap ada video baru.",
    title: `Koleksi Dr. Pinguin Bokep Terbaru ${YEAR} - Bokep Indo Pilihan | ${TITLE_SUFFIX}`,
    description: `Koleksi Dr. Pinguin Bokep terbaru ${YEAR}: bokep indo pilihan yang diunggah sendiri, langsung tonton di HP tanpa download.`,
  },
};

export function categorySeo(slug: string): CategorySeo {
  const cat = CATEGORIES.find((c) => c.slug === slug);
  const label = cat?.label || "Video";
  const c = COPY[slug] || { h1: `Bokep ${label} Terbaru`, intro: `Koleksi video ${label} pilihan yang diperbarui berkala. Tonton langsung di HP maupun desktop. Khusus pengunjung 18 tahun ke atas.` };
  const title = c.title || `${c.h1} ${YEAR} | ${TITLE_SUFFIX}`;
  let description = c.intro.replace(/\s*Khusus pengunjung 18 tahun ke atas\.$/, "");
  description = c.description || `${c.h1} ${YEAR} di ${BRAND}. ${description}`;
  if (description.length > 160) description = `${description.slice(0, 157).replace(/\s+\S*$/, "")}…`;
  return { title, h1: c.h1, description, intro: c.intro };
}

/** Cari slug kategori dari slug atau label tampilan (mis. "AI+"). */
export function categorySlugFor(labelOrSlug?: string | null): string | undefined {
  const k = String(labelOrSlug || "").trim().toLowerCase();
  if (!k) return undefined;
  return CATEGORIES.find((c) => c.slug === k || c.label.toLowerCase() === k)?.slug;
}
