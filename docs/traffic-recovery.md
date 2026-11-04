# Traffic recovery: findings, experiments, owner actions

Sumber angka: `data/traffic-daily.json` (D1, visitor unik per hari WIB) dan `data/traffic-landing.json`
(workflow `traffic-landing`, run 41911599388; rata-rata visitor/hari, 23-30 Okt vs 1-4 Nov). Bukan request bot.

## Diagnosis (terbukti)

| Sumber | 23-30 Okt /hari | 1-4 Nov /hari |
|---|---|---|
| DuckDuckGo | ~2.400 | 14-45 |
| Bing | ~200 | 0-1 |
| Yahoo | ~80 | 0 |
| Direct | ~400 | 3-10 |
| Google, JustPaste, Brave, tube_ref, X | stabil | stabil / naik |

- Penurunan = runtuhnya sekaligus satu keluarga sumber (DDG + Bing + Yahoo, yang memakai indeks Bing) pada 31 Okt -> 1 Nov.
  Google, JustPaste, internal, returning visitor tidak ikut turun, jadi bukan bug pencatatan analytics.
- Kehilangan terkonsentrasi di halaman kategori, bukan halaman video: DDG `/kategori/ai-plus` 1.365 -> 3 per hari,
  `/kategori/malaysia` 329 -> 1, `/kategori/bokep` 194 -> 1, `/kategori/doggy` 135 -> 1, `/` 91 -> 5.
  Bing dan Yahoo punya pola halaman yang sama. "Direct" yang hilang juga di halaman itu (ai-plus 244 -> 0),
  yaitu kunjungan tanpa referrer dari mesin yang sama.
- Bukan blokir teknis: Bingbot/DuckDuckBot/Googlebot/mobile mendapat 200, `index,follow`, canonical benar,
  robots.txt dan sitemap normal. Tidak ada commit pada 30 Okt-1 Nov yang menyentuh template kategori, robots, canonical atau sitemap.
- Belum terbukti: penyebab di sisi Bing (re-evaluasi, demosi, atau deindeks halaman kategori). Itu hanya bisa dilihat di
  Bing Webmaster Tools akun pemilik. Tidak ada penalti yang diasumsikan.

## Pembaruan: bukti per jam dan profil pengunjung (workflow `traffic-diagnose`, run 41912791302)

Hipotesis "ranking Bing turun" tidak cocok dengan data:

1. **Runtuh persis pada satu jam, bukan bertahap.** 31 Okt jam 11:00 WIB: DuckDuckGo 51, Bing 4, direct 13 visitor.
   Jam 12:00 WIB: DuckDuckGo 1, Bing 0, direct 1. Sesudahnya hampir nol terus. Google dan JustPaste tidak berubah pada jam itu.
   Perubahan ranking tidak memotong tiga sumber sekaligus pada batas jam yang sama, apalagi "direct".
2. **Direct ikut hilang bersamaan.** Kunjungan tanpa referrer tidak bergantung pada Bing. Direct, DDG dan Bing berhenti pada jam yang sama,
   jadi penyebabnya satu sumber yang sama untuk ketiganya, bukan tiga kegagalan terpisah.
3. **Profil tidak seperti pencari Indonesia.** Sebelum runtuh (28-30 Okt, first-touch): direct = US 610, PL 251, NL 103, FR 97, DE 63, ID 3;
   hampir semua mobile Chrome, referrer kosong. DuckDuckGo = ID 3.602, US 833, SG 596. DuckDuckGo (rata-rata ~2.400/hari) 12x Google (~190/hari)
   untuk situs berbahasa Indonesia, padahal pangsa DuckDuckGo di Indonesia sangat kecil. Itu tidak masuk akal sebagai trafik pencarian organik murni.
4. **Perilaku:** rata-rata 5-6 halaman per visitor dan sekitar 46% hanya 1 halaman, mirip Google (5-9 halaman). Perilaku saja tidak membedakan; yang membedakan adalah negara, jam berhentinya, dan rasio terhadap Google.
5. **Pendapatan iklan tidak ikut turun sebanding.** TrafficStars (laporan publisher): pendapatan harian 1,2-1,7 USD pada 22-25 Okt saat
   visitor di puncak, 2,4-2,7 USD sekarang (visitor turun ~75%). Trafik yang hilang hampir tidak bernilai iklan.
6. Bukan perubahan kode: tidak ada commit pada jendela 31 Okt jam 12:00 WIB (05:00 UTC). Pencatat analytics (`online.ts`, `analytics-d1.ts`)
   tidak berubah sebelum 2 Nov.

Kesimpulan yang didukung bukti: sebagian besar "pengunjung" DuckDuckGo/Bing/direct yang hilang kemungkinan bukan pencari organik Indonesia, melainkan
satu sumber otomatis atau terproksi yang berhenti 31 Okt 12:00 WIB (atau diblokir oleh aturan di sisi Cloudflare pada jam itu). Trafik inti manusia
(Google, JustPaste, Brave, tube_ref, X, returning) stabil. Ini belum membuktikan siapa pengirimnya. Dua hal yang bisa memastikannya:

- Cloudflare > Audit Log dan Security > Events pada 31 Okt ~05:00 UTC: adakah aturan WAF/Bot Fight/rate limit baru yang menantang trafik itu?
- Bing Webmaster Tools: jika klik Bing 23-30 Okt jauh di bawah ~2.600/hari (DDG+Bing), selisihnya bukan trafik pencarian. Jika Bing menunjukkan
  klik besar yang hilang pada 31 Okt, ranking memang turun.
- Apakah ada layanan promosi/traffic/iklan pihak ketiga yang dimulai ~12 Okt dan berhenti 31 Okt?

Dampak untuk strategi: baseline pertumbuhan yang jujur adalah Google + Brave + JustPaste + referral + X + returning (kira-kira 1.500-1.600
visitor/hari), bukan 6.000. Monitor sekarang menyimpan `sources_id` (visitor per sumber yang negaranya ID) di `data/traffic-daily.json`
supaya kenaikan trafik pencarian dinilai dari pengunjung Indonesia, bukan total mentah.

## Tindakan pemilik (butuh akun, tidak bisa dilakukan dari repo)

1. Bing Webmaster Tools > URL Inspection untuk `/kategori/ai-plus`, `/kategori/malaysia`, `/kategori/bokep`, `/`.
   Catat: indexed atau tidak, last crawled, canonical yang dipilih Bing, ada tidaknya "Blocked/Discovered not indexed".
2. Search Performance, bandingkan 23-30 Okt vs 1-4 Nov per halaman dan query (impression, klik, posisi rata-rata).
   Impression turun + posisi turun = ranking hilang. Impression 0 = deindeks.
3. Reports > Site Scan dan Security/Manual Actions. Periksa notifikasi pelanggaran kebijakan.
4. Setelah pemeriksaan, Request indexing / Submit URL untuk 4 halaman di atas. IndexNow sudah aktif.
5. Kirim hasil 1-3 (tangkapan layar) ke sesi berikutnya supaya perbaikan di halaman bisa berdasar bukti.

## Eksperimen (baseline = rata-rata 23-30 Okt; ukur dengan visitor unik D1, bukan impression)

| # | Hipotesis | Tindakan | Sumber / UTM | Durasi | Keputusan |
|---|---|---|---|---|---|
| E1 | Halaman kategori kehilangan peringkat Bing, bukan seluruh situs | Hasil URL Inspection (tindakan pemilik 1-4), jalankan ulang workflow `traffic-landing` setelah 7 hari | bing/duckduckgo, tanpa UTM | 7 hari | Jika terindeks tapi turun: perbaiki konten/judul kategori. Jika tidak terindeks: ajukan ulang, jangan ubah massal |
| E2 | Link Bluesky dengan UTM menghasilkan kunjungan terukur | Pakai poster Bluesky yang ada (sudah memakai UTM), baca kartu Campaign di `/pemilik` | `utm_source=bluesky&utm_medium=social&utm_campaign=autopost` | 14 hari | Pertahankan jika >0 visitor unik/hari, hentikan jika nol |
| E3 | JustPaste (~550/hari) adalah pintu masuk stabil, bukan Bing | Jangan diubah. Pantau `justpaste` di `data/traffic-daily.json` | referrer justpaste | 14 hari | Ada penurunan >40% = peringatan workflow traffic-monitor |
| E4 | Returning visitor naik dengan prompt ulang kunjungan (#169) | Pantau `returning` harian (480-960 sekarang) | internal | 14 hari | Naik = lanjutkan, flat = uji teks banner |

Pencatatan: kartu "Campaign (UTM)" di `/pemilik` dan `data/traffic-daily.json`. Isi kolom hasil dari data itu, bukan perkiraan.

## Materi siap pakai (belum diposting, butuh tindakan pemilik)

- Telegram/X/Reddit: pakai hanya kanal yang mengizinkan konten dewasa dan tandai NSFW. Reddit: subreddit dengan aturan yang
  mengizinkan tautan, baca aturan sebelum posting, jangan duplikasi posting. X: akun ditandai sensitif.
- Tautan: `https://koleksidrpinguin.com/kategori/<slug>?utm_source=<kanal>&utm_medium=social&utm_campaign=<nama>`.
- Direktori teman (`/teman`) dan partner: ajukan tukar tautan hanya dengan situs yang relevan dan nyata. Tidak ada jaringan link atau akun palsu.

## Belum dikerjakan

- Audit 135 thumbnail kosong dan 99 kegagalan dari 1.490 klik play. Sudah ada: `data/thumb-health.json` (4 Nov: 10.312 ok dari
  10.896, 579 absen, 307 tanpa sumber untuk diperbaiki otomatis, 219 masih rusak setelah perbaikan). Kegagalan per server perlu
  data `player_errors` dari panel `/pemilik` (tidak bisa dibaca dari repo).
- Optimasi judul/deskripsi kategori berdasarkan data Bing: ditunda sampai hasil tindakan pemilik 1-3, agar tidak berubah massal tanpa bukti.
