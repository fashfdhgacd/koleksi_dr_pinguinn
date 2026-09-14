# LAYAR

Situs streaming arsip film publik. Katalog diambil dari JSON Internet Archive, dimuat per 24 judul, satu endpoint data `/api/data`.

## Menjalankan

```bash
npm install
npm run dev
```

Buka preview/dev server yang muncul, lalu:

- cari judul
- pilih kategori
- buka film dan tekan **Putar** (file video baru di-request saat itu)

## Build & Vercel

```bash
npm run build
```

Hubungkan repo GitHub ke [Vercel](https://vercel.com) (Hobby/Free). Satu serverless function sudah cukup — jangan pecah jadi banyak API route.

## API

Semua data lewat:

```
GET /api/data?type=home
GET /api/data?type=latest&page=1&limit=24
GET /api/data?type=category&category=horror&page=1&limit=24
GET /api/data?type=search&q=chaplin&page=1&limit=24
GET /api/data?type=detail&id=charlie_chaplin_film_fest
```
