# DR. PINGUIN — Koleksi Mandiri

Situs koleksi video **mandiri**. Tidak bergantung ke domain `koleksidrpinguin.site` untuk data atau thumbnail.

## Mode data

| Mode | Env | Perilaku |
|------|-----|----------|
| **Local-first (default)** | — | Baca `src/lib/catalog/videos.json` + `streamtape.json` saja |
| Remote enrichment | `CATALOG_REMOTE=1` | Opsional merge data dari feed remote (boleh dimatiin total) |

## Thumbnail Streamtape

Route: `/api/tape-thumb?id={fileId}`

Set di environment (server):

```
STREAMTAPE_LOGIN=...
STREAMTAPE_KEY=...
```

Kalau key tidak ada, thumbnail menampilkan placeholder branded (bukan gambar rusak).

## Struktur data lokal

```
src/lib/catalog/
  videos.json       ← katalog utama (IndoAV, UserBokep, dll)
  streamtape.json   ← batch Streamtape
```

Format item:

```json
{
  "id": "Y6XxXjZ3lrSvAmR",
  "title": "Judul Video",
  "embed": "https://streamtape.com/e/Y6XxXjZ3lrSvAmR",
  "direct": "https://streamtape.com/e/Y6XxXjZ3lrSvAmR",
  "source": "Streamtape",
  "category": "amatir"
}
```

## Bot Telegram (opsional)

`bot.js` bisa nulis ke `data/videos.json` / `data/putarin.json`.  
Setelah itu **copy/merge** ke `src/lib/catalog/` lalu deploy ulang.

Atau set `GITHUB_TOKEN` + `GITHUB_OWNER` + `GITHUB_REPO` agar bot commit langsung.

## Dev

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Env penting

| Key | Wajib | Keterangan |
|-----|-------|------------|
| `STREAMTAPE_LOGIN` | Tidak | Thumb Streamtape via API resmi |
| `STREAMTAPE_KEY` | Tidak | Thumb Streamtape via API resmi |
| `CATALOG_REMOTE` | Tidak | `1` = izinkan fetch feed remote |

Tanpa key Streamtape pun situs tetap jalan penuh — hanya thumbnail Streamtape yang pakai placeholder.
