# KDP Telegram Bot

Bot admin untuk [koleksidrpinguin.com](https://koleksidrpinguin.com/).

Kirim link **Streamtape** atau **Putarin** ke bot. Bot menulis JSON dengan skema yang dibaca situs:

- `data/videos.json` → Streamtape
- `data/putarin.json` → Putarin

Situs live membaca file ini dari:

- `https://www.koleksidrpinguin.site/data/videos.json`
- `https://www.koleksidrpinguin.site/data/putarin.json`

Jadi setelah bot nulis file, file itu harus sampai ke folder `data/` di project `.site` (copy manual, atau biarkan bot push ke GitHub).

## 1. Install

```bash
cd kdp-bot
cp .env.example .env
```

Isi `.env`:

```
BOT_TOKEN=123456:ABC...
AUTHORIZED_USER_IDS=123456789
PUTARIN_API_KEY=
STREAMTAPE_LOGIN=
STREAMTAPE_KEY=
```

Cara dapat Telegram user ID: chat `@userinfobot`.

Tidak perlu `npm install`. Cukup Node 18+.

```bash
node bot.js
```

## 2. Format chat

Link saja:

```
https://streamtape.com/e/Y6XxXjZ3lrSvAmR
```

```
https://panel.putarin.com/v/ABC123xyz
```

Atau lengkap:

```
Judul: Tante Viral Hotel
Kategori: tante
https://streamtape.com/e/xxxxx
```

Boleh beberapa link sekaligus.

## 3. Hasil JSON

```json
{
  "id": "Y6XxXjZ3lrSvAmR",
  "title": "Tante Viral Hotel",
  "embed": "https://streamtape.com/e/Y6XxXjZ3lrSvAmR",
  "direct": "https://streamtape.com/e/Y6XxXjZ3lrSvAmR",
  "source": "Streamtape",
  "category": "tante",
  "tags": ["tante", "streamtape", "telegram"],
  "date": "2026-09-15"
}
```

Link sama (ID sama) tidak diduplikasi. Data lama di-update.

## 4. Biar muncul di website

Pilih salah satu:

1. Copy `data/videos.json` dan `data/putarin.json` ke repo/project `koleksidrpinguin.site` folder `data/`, lalu deploy ulang.
2. Isi `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` di `.env`. Bot akan commit file ke repo setiap ada video baru.

Tanpa langkah ini, JSON hanya tersimpan di mesin tempat bot jalan.

## 5. Host yang diterima

- `streamtape.com/e/{id}`
- `streamtape.com/v/{id}`
- `panel.putarin.com/e/{code}`
- `panel.putarin.com/v/{code}`
- `putarin.com/...`

Domain lain ditolak.

## 6. Keamanan

Jangan commit file `.env`.
Jangan taruh API key di frontend.
Kalau key Putarin/Streamtape pernah kepaste di chat, regenerate.
