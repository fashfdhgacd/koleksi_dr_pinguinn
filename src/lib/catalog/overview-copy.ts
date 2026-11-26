import type { PublicLanguage } from "../public-locale.ts";

type Copy = { heading: string; intro: string; description: string };
const catalog: Record<string, Record<PublicLanguage, Copy>> = {
  "/": {
    id: { heading: "Video Bokep Indo Terbaru", intro: "Mulai dari judul yang baru masuk, atau pilih kategori untuk mempersempit pencarian. Kalau sudah tahu judulnya, langsung gunakan kolom pencarian.", description: "Temukan video bokep Indo terbaru dalam katalog berisi # video. Koleksi Dr. Pinguin diperbarui setiap hari. Telusuri kategori atau cari berdasarkan judul." },
    ms: { heading: "Video Indonesia Terkini", intro: "Lihat keluaran terbaharu dalam katalog Indonesia kami. Pilih kategori yang diminati atau taip sebahagian daripada tajuk untuk mencarinya.", description: "Semak video Indonesia terkini dalam katalog # video di Koleksi Dr. Pinguin. Katalog dikemas kini setiap hari dan dilayari mengikut tajuk atau kategori." },
    en: { heading: "Latest Indonesian Videos", intro: "Browse recent additions to the Indonesian video catalogue. Open a category to narrow the selection, or enter a title in the search bar.", description: "Explore the latest Indonesian videos in a catalogue of # titles. Koleksi Dr. Pinguin updates daily. Browse recent additions by category or search by title." },
  },
  "/kategori/videy": {
    id: { heading: "Bokep Videy Indo Terbaru", intro: "Di sini video Videy dikumpulkan dalam satu daftar. Mulai dari judul terbaru, atau buka pilihan Videy Indo paling ditonton untuk melihat yang sedang ramai.", description: "Cari bokep Videy Indo terbaru di antara # video Videy. Katalog diperbarui setiap hari. Lihat judul yang baru masuk atau jelajahi pilihan yang paling ditonton." },
    ms: { heading: "Video Videy Indo Terkini", intro: "Semak tajuk dalam koleksi Videy, daripada klip Indonesia yang baru disenaraikan hingga pilihan ramai. Pautan paling banyak ditonton turut tersedia di bawah.", description: "Layari # video dalam koleksi Videy dan temui tajuk Indo terkini. Katalog dikemas kini setiap hari. Semak tambahan terbaharu atau lihat pilihan ramai di sini." },
    en: { heading: "Latest Videy Videos", intro: "Find Videy titles in one place, including clips from Indonesia. Start with the latest additions or follow the most-watched link to explore popular titles.", description: "Browse # Videy videos and discover the latest Indonesian clips. The catalogue is updated daily. Check recent additions or explore popular Videy titles." },
  },
  "/kategori/malaysia": {
    id: { heading: "Video Melayu Malaysia Terbaru", intro: "Telusuri video Malaysia dengan judul Melayu dan Indonesia dalam satu kategori. Gunakan judul di setiap kartu untuk memilih video yang ingin dibuka.", description: "Jelajahi # video Malaysia dan temukan judul Melayu terbaru di Koleksi Dr. Pinguin. Katalog diperbarui setiap hari. Lihat daftar lengkapnya di kategori ini." },
    ms: { heading: "Video Melayu Malaysia Terkini", intro: "Cari video Melayu dalam koleksi Malaysia, termasuk pilihan bertudung. Semak tajuk pada kad video atau selak halaman seterusnya untuk pilihan lain.", description: "Terokai # video Malaysia dan cari tajuk Melayu terkini, termasuk pilihan bertudung. Katalog dikemas kini setiap hari. Lihat senarai di Koleksi Dr. Pinguin." },
    en: { heading: "Latest Malaysian and Malay Videos", intro: "Explore the Malaysian collection by title, including Malay-language listings. Browse the cards below to see what has been added to this category.", description: "Discover the latest Malay titles in a collection of # Malaysian videos. The catalogue is updated daily. Browse the listings and open a title for details." },
  },
  "/kategori/jav": {
    id: { heading: "JAV Sub Indo Terbaru", intro: "Cari video Jepang lewat kode JAV atau nama yang tercantum pada judul. Cek keterangan masing-masing video untuk informasi subtitle.", description: "Telusuri # video JAV dan cari judul Jepang terbaru lewat kode atau nama artis. Katalog diperbarui setiap hari. Periksa keterangan subtitle pada tiap judul." },
    ms: { heading: "Video JAV Jepun Terkini", intro: "Jika anda tahu kod JAV, gunakan kod itu untuk mencari tajuk Jepun yang sepadan. Semak butiran setiap video untuk maklumat sari kata.", description: "Semak # video JAV Jepun dan cari keluaran terkini mengikut kod atau nama pelakon. Katalog dikemas kini setiap hari. Lihat butiran sari kata pada tajuk itu." },
    en: { heading: "Latest Japanese JAV Videos", intro: "Browse Japanese releases or search for a familiar JAV code. Check the individual title for subtitle information before choosing a video.", description: "Search # Japanese JAV videos for the latest titles by release code or performer. The catalogue is updated daily. Check each listing for subtitle details." },
  },
  "/kategori/hentai": {
    id: { heading: "Video Hentai Terbaru", intro: "Jelajahi katalog animasi dewasa dan pilih seri dari judul yang tertera. Untuk video berseri, nomor episode membantu menemukan bagian yang ingin ditonton.", description: "Temukan seri dan episode hentai terbaru dalam koleksi # video animasi dewasa. Katalog diperbarui setiap hari. Cari judul seri atau telusuri daftar episodenya." },
    ms: { heading: "Siri Hentai dan Episod Terkini", intro: "Lihat pilihan animasi dewasa mengikut tajuk siri. Jika tajuk menyertakan nombor episod, gunakan nombor itu untuk menyambung tontonan anda.", description: "Cari siri hentai terkini dalam senarai # video animasi dewasa. Katalog dikemas kini setiap hari. Semak tajuk dan nombor episod untuk cari episod seterusnya." },
    en: { heading: "Latest Hentai Series and Episodes", intro: "Browse adult animation by series title. Episode numbers in the listings make it easier to find the next part of a series you already follow.", description: "Explore the latest hentai series in a catalogue of # animations. Updated daily, the listings include series titles and episode numbers where listed." },
  },
};

export function overviewCopy(path: string, language: PublicLanguage, total?: number) {
  const entry = catalog[path]?.[language];
  if (!entry || total === undefined || !Number.isSafeInteger(total) || total < 0) return null;
  return { ...entry, title: entry.heading + " | Koleksi Dr. Pinguin",
    description: entry.description.replace("#", total.toLocaleString(language)) };
}
