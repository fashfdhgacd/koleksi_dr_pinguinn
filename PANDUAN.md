# Panduan Operasional — koleksidrpinguin.com

Dokumen ini untuk pemilik/penerus. **Tidak ada password atau API key di file ini** — file ini
hanya menjelaskan di manaeverything disimpan dan apa yang harus dilakukan kalau ada masalah.
Kalau repo ini sampai publik, tetap aman: tidak ada rahasia di dalamnya.

## Gambaran singkat

- **Situs**: React + Cloudflare Workers, domain `koleksidrpinguin.com`
- **Database**: Cloudflare D1 (`koleksi-analytics`) untuk analytics & komentar, KV untuk antrean
  upload & flag, R2 untuk poster
- **Konten/video**: disimpan sebagai file JSON di folder `data/` di repo ini. Setiap upload
  menghasilkan commit otomatis ke `main` lalu auto-deploy.
- **Upload video** bisa lewat 2 jalan:
  1. **Bot Telegram** — kirim link video (Videy, IndoAV, UserBokep, Streamtape, Putarin,
     LuluStream/DoodStream/Byse) ke bot. Judul otomatis dibuat; yang tanpa judul bisa dirapikan
     nanti.
  2. **Panel `/pemilik`** — login dengan kunci owner, ada tool upload massal + moderasi.

## Alur upload (yang normal)

1. Kirim link → bot/panel menerima
2. Video Videy masuk **antrean KV** (`bot:q:*`), bukan langsung tayang
3. **Cron tiap jam jam :07 WIB** (UTC :07) mem-flush antrean → commit ke `data/` → auto-deploy
4. Video tayang ± beberapa menit setelah deploy

Jadi video yang baru diupload **wajar belum tampil sampai flush berikutnya (maks ~1 jam)**.
Jangan upload ulang — bisa dobel.

## Cek status cepat

| Yang dicek | Cara |
|---|---|
| Cron & flush terakhir | Buka `https://koleksidrpinguin.com/api/cron-status` — lihat `last.at` dan `flush` |
| Antrean upload menumpuk | Kunci KV `bot:q:*` (lihat bawah) — kalau ratusan dan flush lama tidak jalan, ada masalah |
| Panel owner | `https://koleksidrpinguin.com/pemilik` |
| Error worker | Cloudflare dashboard → Workers → `koleksi-dr-pinguinn` → Logs |

## Monitoring otomatis (sudah dipasang)

- **Site health** (GitHub Actions, tiap 6 jam): cek beranda, sitemap, sample halaman watch,
  redirect domain lama, DAN `/api/cron-status` (kalau cron mati >3 jam → job gagal →
  **GitHub mengirim email ke pemilik**). Gratis, tanpa secret tambahan.
- Komentar pengunjung statusnya **pending** sampai di-approve di `/pemilik` → Perlu dicek.

## Kalau ada masalah

| Gejala | Kemungkinan & langkah |
|---|---|
| Upload tidak masuk | Cek `/api/cron-status` — flush terakhir kapan? Kalau antrean menumpuk, cron mungkin mati |
| Situs error total | Cloudflare dashboard → Workers → Deployments → **rollback** ke versi sebelumnya |
| Bot Telegram tidak membalas | Cek `https://koleksidrpinguin.com/api/telegram?health=1` — lihat `signedUpdateLastHour` |
| Komentar tidak tampil | Normal — harus di-approve dulu di `/pemilik` |
| Popunder/iklan aneh | Aturan di `src/components/card-popunder.ts` dan `page-pop-cap.ts` |

## Di mana rahasia disimpan (TANPA nilainya)

- **Cloudflare Worker secrets**: `BOT_TOKEN`, `GH_TOKEN`, `CF_API_TOKEN`, `TELEGRAM_USER_ID`,
  dll — dashboard Cloudflare → Workers → Settings → Variables and Secrets
- **GitHub repo secrets**: `BLUESKY_*`, `STREAMTAPE_*`, `PUTARIN_*` — repo Settings → Secrets
- **Token GitHub untuk bot** (`GH_TOKEN`): fine-grained token — **cek expiry date-nya secara
  berkala**, perpanjang sebelum habis atau upload bot akan gagal
- File `.env` lokal (jangan di-commit)

## Hal yang perlu diingat

- **Jangan commit file `.env` atau secret apa pun** ke repo
- Deploy produksi = `npm run build` lalu `npm run deploy:cf` (butuh wrangler login)
- Data video ada di `data/` — jangan edit manual kecuali paham formatnya
- Test yang gagal `EPERM symlink` di Windows itu environmental, bukan bug
- Untuk bantuan teknis: Devin (agen AI) — jelaskan gejalanya saja
