import { CATEGORIES } from "./categories";

export type CategorySeo = { title: string; h1: string; description: string; intro: string };

const YEAR = 2026;
const BRAND = "Koleksi Dr. Pinguin";
/** Suffix judul tab/SERP: domain (keputusan pemilik). */
const TITLE_SUFFIX = "koleksidrpinguin.com";

/**
 * SEO FREEZE: categories that currently rank in search (ai-plus, malaysia, doggy, bokep, jav)
 * keep their title and h1 exactly as they are. Search engines re-evaluate a page when its
 * title/h1 change; two rewrites of ai-plus in 25 hours (Oct 26-27 2026) cost most of its
 * Bing/DuckDuckGo traffic. Only touch intro/description of these, and only with a reason.
 */
const COPY: Record<string, { h1: string; intro: string; title?: string; description?: string }> = {
  jav: {
    h1: "JAV Sub Indo Terbaru",
    intro: "Kumpulan JAV sub indo dan bokep Jepang terbaru, diurutkan dari yang baru masuk. Cari pakai kode atau nama artis lewat kolom pencarian, lalu putar langsung di HP tanpa aplikasi tambahan.",
    title: `JAV Sub Indo Terbaru ${YEAR} - Bokep Jepang Kode Lengkap | ${TITLE_SUFFIX}`,
    description: `Nonton JAV sub indo terbaru ${YEAR}: bokep Jepang dengan kode dan nama artis, bisa dicari dan diputar langsung di HP tanpa download.`,
  },
  // FROZEN (SEO): title/h1 below are the wording that ranked on Bing/DDG (Oct 19-26 2026).
  // Rewriting them on Oct 26 (#65) and Oct 27 (#116) preceded a ~80% drop in ai-plus search
  // landings, so they were restored. Do NOT reword title/h1 of ranked categories
  // (ai-plus, malaysia, doggy, bokep, jav); improve intro/description instead.
  "ai-plus": {
    h1: "Bokep AI+ Terbaru",
    intro: "Video AI+ terbaru yang lagi banyak dicari: bokep AI indo dan Asia buatan AI, gambar jernih dan streaming lancar di HP. Video baru masuk hampir tiap hari. Kalau mau yang rekaman asli, cek juga kategori Viral, Amatir atau Videy di bawah.",
    title: `Bokep AI+ Terbaru ${YEAR} - Video AI Viral | ${TITLE_SUFFIX}`,
    description: `Bokep AI+ terbaru ${YEAR}: video AI viral dan bokep AI indo yang lagi banyak dicari, jernih dan lancar diputar langsung di HP.`,
  },
  "ai-gay": {
    h1: "Video AI Gay Terbaru",
    intro: "Kumpulan video AI gay buatan AI: adegan sesama pria hasil generate AI, semua pemeran dewasa. Kategori baru, videonya ditambah bertahap.",
    title: `Video AI Gay Terbaru ${YEAR} - Kategori AI GAY | ${TITLE_SUFFIX}`,
    description: `Video AI gay terbaru ${YEAR} di Koleksi Dr. Pinguin: adegan sesama pria buatan AI, pemeran dewasa, langsung putar di HP tanpa download.`,
  },
  jilbab: {
    h1: "Bokep Jilbab Indo Viral",
    intro: "Video jilbab dan hijab indo yang lagi banyak dicari, dari rekaman pasangan sampai yang sempat viral di media sosial. Semua pemeran dewasa, langsung putar di HP.",
    title: `Bokep Jilbab Indo Viral ${YEAR} - Video Hijab Terbaru | ${TITLE_SUFFIX}`,
    description: `Bokep jilbab indo viral ${YEAR}: video hijab terbaru yang lagi banyak dicari, pemeran dewasa, tonton langsung di HP tanpa download.`,
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
    h1: "Bokep Indo Viral Hari Ini",
    intro: "Video indo yang lagi ramai dibagikan di X, Telegram dan TikTok, dikumpulkan di satu halaman supaya tidak perlu buka link satu per satu. Yang paling baru selalu tampil paling atas.",
    title: `Bokep Indo Viral Hari Ini ${YEAR} - Video Ramai X & Telegram | ${TITLE_SUFFIX}`,
    description: `Bokep indo viral hari ini: video yang lagi ramai di X, Telegram dan TikTok ${YEAR}, terkumpul di satu halaman dan langsung bisa diputar.`,
  },
  percakapan: {
    h1: "Bokep Indo Ada Percakapannya",
    intro: "Video indo yang suaranya jelas dan ada obrolannya, mulai dari video call sampai rekaman pasangan yang ngobrol santai. Cocok kalau kamu suka yang terasa lebih nyata.",
    title: `Bokep Indo Percakapan Jelas ${YEAR} - Suara Jernih | ${TITLE_SUFFIX}`,
    description: `Bokep indo dengan percakapan jelas ${YEAR}: video call dan rekaman pasangan dengan obrolan dan suara jernih, langsung putar di HP.`,
  },
  kosan: {
    h1: "Bokep Kosan Indo Viral",
    intro: "Video mesum di kosan yang lagi viral, rekaman asli anak kos dan pasangan. Langsung putar di HP.",
    title: `Bokep Kosan Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep kosan indo viral terbaru ${YEAR}: rekaman asli anak kos dan pasangan yang lagi rame, tonton langsung di HP.`,
  },
  colmek: {
    h1: "Video Colmek Indo Terbaru",
    intro: "Rekaman colmek indo dari VCS, live dan video pribadi yang sempat beredar. Isinya diperbarui setiap ada unggahan baru, diputar langsung tanpa pindah aplikasi.",
    title: `Video Colmek Indo Terbaru ${YEAR} - VCS & Rekaman Pribadi | ${TITLE_SUFFIX}`,
    description: `Video colmek indo terbaru ${YEAR}: rekaman VCS, live dan video pribadi yang sempat beredar, langsung tonton di HP tanpa download.`,
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
    h1: "Bokep Doggy Style Indo",
    intro: "Pilihan video gaya doggy dari indo dan Asia, dari rekaman amatir sampai yang lebih rapi. Diurutkan dari yang terbaru, tinggal pilih lalu putar.",
    title: `Bokep Doggy Style Indo Terbaru ${YEAR} - Indo & Asia | ${TITLE_SUFFIX}`,
    description: `Bokep doggy style indo terbaru ${YEAR}: video gaya nungging dari indo dan Asia, amatir sampai rapi, langsung putar di HP.`,
  },
  "open-bo": {
    h1: "Bokep Open BO Indo Viral",
    intro: "Video open BO dan michat yang lagi rame, rekaman asli yang paling banyak dicari.",
    title: `Bokep Open BO Indo Viral Terbaru ${YEAR} - Michat | ${TITLE_SUFFIX}`,
    description: `Bokep open BO indo viral terbaru ${YEAR}: rekaman michat dan BO asli yang lagi rame, langsung tonton di HP.`,
  },
  malaysia: {
    h1: "Bokep Malaysia & Melayu Viral",
    intro: "Video Malaysia dan melayu yang lagi viral, termasuk rekaman bertudung dan amatir dari negeri jiran. Bahasanya dekat dengan bahasa kita, jadi tetap enak ditonton.",
    title: `Bokep Malaysia Viral Terbaru ${YEAR} - Video Melayu & Tudung | ${TITLE_SUFFIX}`,
    description: `Bokep Malaysia viral terbaru ${YEAR}: video melayu, bertudung dan amatir dari negeri jiran yang lagi ramai, langsung putar di HP.`,
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
  "blunder": {
    h1: "Video Blunder Indo Viral",
    intro: "Video blunder indo: momen kelepasan dan rekaman yang tidak sengaja tersebar, dikumpulkan dari judul yang menyebut blunder.",
    title: `Video Blunder Indo Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Video blunder indo viral terbaru ${YEAR}: rekaman kelepasan yang lagi dicari, langsung putar di HP.`,
  },
  "kelas-bintang": {
    h1: "Bokep Kelas Bintang",
    intro: "Koleksi kelas bintang: video yang judulnya menyebut kelas bintang, pemeran dewasa, kualitas rekaman lebih rapi.",
    title: `Bokep Kelas Bintang Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep kelas bintang terbaru ${YEAR} di Koleksi Dr. Pinguin: video pilihan dengan pemeran dewasa, putar langsung tanpa download.`,
  },
  "tiktok": {
    h1: "Video TikTok Viral 18+",
    intro: "Video dari kreator TikTok dan tiktoker dewasa yang lagi rame, versi tanpa sensor.",
    title: `Video TikTok Viral 18+ Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Video tiktoker 18+ viral terbaru ${YEAR}: kreator TikTok dewasa versi tanpa sensor, langsung putar di HP.`,
  },
  "mantan": {
    h1: "Video Mantan Viral",
    intro: "Rekaman bareng mantan yang tersebar dan lagi dicari, dikumpulkan dari judul yang menyebut mantan.",
    title: `Video Mantan Viral Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Video mantan viral terbaru ${YEAR} di Koleksi Dr. Pinguin: rekaman lama bareng mantan, putar langsung di HP.`,
  },
  "vcs": {
    h1: "Video VCS Indo",
    intro: "Rekaman video call sex (VCS) indo: layar HP, obrolan langsung, gaya amatir.",
    title: `Video VCS Indo Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Video VCS indo terbaru ${YEAR}: rekaman video call sex amatir yang lagi rame, langsung putar di HP.`,
  },
  "kompilasi": {
    h1: "Kompilasi Bokep Indo",
    intro: "Video kompilasi: beberapa klip digabung dalam satu video, enak buat nonton sekaligus.",
    title: `Kompilasi Bokep Indo Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Kompilasi bokep indo terbaru ${YEAR}: banyak klip dalam satu video, putar langsung di HP tanpa download.`,
  },
  "tetangga": {
    h1: "Bokep Tetangga Indo",
    intro: "Video dengan cerita tetangga: dari tetangga kos sampai sebelah rumah, semua pemeran dewasa.",
    title: `Bokep Tetangga Indo Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep tetangga indo terbaru ${YEAR} di Koleksi Dr. Pinguin: cerita sebelah rumah yang lagi rame, langsung putar di HP.`,
  },
  "kacamata": {
    h1: "Bokep Cewek Berkacamata",
    intro: "Kumpulan video cewek berkacamata, dari gaya kalem sampai yang binal.",
    title: `Bokep Cewek Berkacamata Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep cewek berkacamata terbaru ${YEAR}: video cewek pakai kacamata yang lagi dicari, putar langsung di HP.`,
  },
  "kantor": {
    h1: "Bokep Kantor Indo",
    intro: "Video bertema kantor: karyawati, sekretaris, dan rekan kerja di jam lembur.",
    title: `Bokep Kantor Indo Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep kantor indo terbaru ${YEAR}: video karyawati dan rekan kerja yang lagi rame, langsung putar di HP.`,
  },
  "anal": {
    h1: "Video Anal Indo dan Asia",
    intro: "Kumpulan video anal dari indo sampai Asia, dipilih dari judul yang jelas menyebutnya.",
    title: `Video Anal Indo dan Asia Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Video anal indo dan Asia terbaru ${YEAR} di Koleksi Dr. Pinguin, langsung putar di HP tanpa download.`,
  },
  "cantik": {
    h1: "Bokep Cewek Cantik Indo",
    intro: "Video cewek cantik indo yang paling sering dicari, wajah jelas dan rekaman jernih.",
    title: `Bokep Cewek Cantik Indo Terbaru ${YEAR} | ${TITLE_SUFFIX}`,
    description: `Bokep cewek cantik indo terbaru ${YEAR}: video cewek cakep yang lagi viral, langsung putar di HP.`,
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

/** Related category links shown under the intro of the busiest landing pages (internal linking). */
const RELATED: Record<string, string[]> = {
  "ai-plus": ["viral", "jav", "hentai", "amatir", "jilbab", "videy"],
  jav: ["ai-plus", "hentai", "barat", "chindo", "videy"],
  jilbab: ["viral", "amatir", "istri", "malaysia", "videy"],
  viral: ["amatir", "jilbab", "colmek", "percakapan", "videy"],
  percakapan: ["vcs", "colmek", "viral", "amatir", "videy"],
  colmek: ["vcs", "percakapan", "viral", "live", "videy"],
  doggy: ["amatir", "viral", "istri", "crot-dalam", "videy"],
  malaysia: ["jilbab", "viral", "chindo", "amatir", "videy"],
};
/** Top category pages that always show a link to /kategori/videy, even without a RELATED list. */
const VIDEY_LINK_PAGES = new Set(["ai-plus", "jav", "hentai", "jilbab", "tante", "amatir", "viral", "istri", "live", "malaysia", "colmek", "doggy", "percakapan"]);

/** Related categories (slug + label) for a category page; always includes Videy on top pages. */
export function categoryRelated(slug: string): Array<{ slug: string; label: string }> {
  const list = [...(RELATED[slug] || [])];
  if (VIDEY_LINK_PAGES.has(slug) && !list.includes("videy")) list.push("videy");
  return list
    .filter((s) => s !== slug)
    .map((s) => CATEGORIES.find((c) => c.slug === s))
    .filter((c): c is (typeof CATEGORIES)[number] => Boolean(c))
    .map((c) => ({ slug: c.slug, label: c.slug === "videy" ? "Videy" : c.label }));
}

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
