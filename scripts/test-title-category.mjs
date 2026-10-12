// Tes kategori otomatis dari judul (bot Telegram + panel /pemilik): node scripts/test-title-category.mjs
// Exit 1 kalau ada yang gagal. Murni kode, tanpa jaringan.
import { detectCategory } from "../src/lib/bot/parse.js";

const cases = [
  ["Cewek Hijab Colmek di Kamar", "jilbab"],
  ["Ukhti Berjilbab Pink Sange", "jilbab"],
  ["Tante Montok Minta Jatah", "tante"],
  ["Janda Muda Kesepian", "tante"],
  ["Bokep Indo Pasutri Rumahan", "amatir"],
  ["Bokep Indo Viral Terbaru 2026", "viral"],
  ["Viral Cewek FYP Tiktok Goyang", "viral"],
  ["VCS Sama Pacar Sambil Ngobrol", "percakapan"],
  ["Video Call Mesra Berdua", "percakapan"],
  ["Ngewe di Kosan Pacar", "kosan"],
  ["Mahasiswi Kost Nakal", "kosan"],
  ["Selingkuh Sama Istri Tetangga", "istri"],
  ["Abang Ojol Dapet Rezeki", "ojol"],
  ["Ngentot Pacar di Hotel", "hotel"],
  ["Bule Pirang Ngewe Brondong", "barat"],
  ["Cewek Chindo Mulus", "chindo"],
  ["Gadis Melayu Cantik", "malaysia"],
  ["Threesome Sama Teman", "gangbang"],
  ["Colmek Pakai Dildo", "colmek"],
  ["Live Bigo Buka Baju", "live"],
  // Batas kata: potongan kata tidak boleh memicu kategori
  ["Kosmetik Mahal Cewek Cantik", "lainnya"],
  ["Indonesia Raya Cewek Cantik", "lainnya"],
  ["Preview Klip Pendek", "lainnya"],
  ["Livea Cantik", "lainnya"],
  ["", "lainnya"],
];

let fail = 0;
for (const [title, want] of cases) {
  const got = detectCategory(title);
  if (got !== want) {
    fail++;
    console.log(`GAGAL  ${JSON.stringify(title)} → ${got} (harusnya ${want})`);
  }
}
console.log(`${cases.length - fail}/${cases.length} lulus`);
process.exit(fail ? 1 : 0);
