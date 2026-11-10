import { publicWatchDescription, type SeoVideoInput } from "@/lib/seo";

/** Satu deskripsi halaman tonton. Sama dengan meta: manual pemilik, lalu kurasi, lalu generator. */
export function watchDescription(item: SeoVideoInput & { id?: string }): string {
  return publicWatchDescription(item);
}

/** Tidak menambah paragraf kedua. Judul tidak diulang di bawah deskripsi. */
export function longWatchDescription(item: SeoVideoInput & { id?: string }): string {
  return watchDescription(item);
}
