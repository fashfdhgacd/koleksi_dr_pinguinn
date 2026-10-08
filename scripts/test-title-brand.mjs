// Tes judul upload bot: node scripts/test-title-brand.mjs  (exit 1 kalau ada yang gagal)
import { brandUploadTitle, cleanUploadTitle } from "../src/lib/bot/title-brand.js";

const S = " - koleksidrpinguin.com";
const cases = [
  // Branding situs lain di akhir → dibuang
  ["Janda Muda Pirang Selingkuh dengan Brondong Tetangga - AVTub", "Janda Muda Pirang Selingkuh dengan Brondong Tetangga"],
  ["Janda Muda Pirang Selingkuh dengan Brondong Tetangga - babi bakar", "Janda Muda Pirang Selingkuh dengan Brondong Tetangga"],
  ["Janda Muda Pirang Selingkuh dengan Brondong Tetangga - AVP", "Janda Muda Pirang Selingkuh dengan Brondong Tetangga"],
  ["Tante Kesepian Minta Jatah | BokepHot", "Tante Kesepian Minta Jatah"],
  ["Mahasiswi Kos Ngewe – KingBokep", "Mahasiswi Kos Ngewe"],
  ["Istri Orang Ketagihan — IndoViral44", "Istri Orang Ketagihan"],
  ["Cewek Hijab Colmek - bokephot.today", "Cewek Hijab Colmek"],
  ["Cewek Hijab Colmek bokephot.today", "Cewek Hijab Colmek"],
  ["Pasutri Rumahan Mesra @bokepviralchannel", "Pasutri Rumahan Mesra"],
  ["Pasutri Rumahan Mesra - t.me/bokepviral", "Pasutri Rumahan Mesra"],
  ["Pasutri Rumahan Mesra https://t.me/bokepviral", "Pasutri Rumahan Mesra"],
  ["Ngentot Pacar di Hotel Join tele @indobokep", "Ngentot Pacar di Hotel"],
  ["Ngentot Pacar di Hotel - Join Telegram: link di bio", "Ngentot Pacar di Hotel"],
  ["Ngentot Pacar di Hotel Telegram: @indobokep", "Ngentot Pacar di Hotel"],
  ["Ngentot Pacar di Hotel [indo18.buzz]", "Ngentot Pacar di Hotel"],
  ["Ngentot Pacar di Hotel (XXXBP)", "Ngentot Pacar di Hotel"],
  ["[KingBokep] Ngentot Pacar di Hotel", "Ngentot Pacar di Hotel"],
  ["Tante Penjaga Salon - AVTub - IndoAV", "Tante Penjaga Salon"],
  ["Abang Ojol Dapet Rezeki - PornHub", "Abang Ojol Dapet Rezeki"],
  // Branding pinguin lama → diganti satu akhiran domain
  ["Bokep indo TANTE PENJAGA SALON (Koleksi Dr. Pinguin Bokep, M.S.B.)", "Bokep indo TANTE PENJAGA SALON"],
  ["Indo FC2543 (Koleksi Dr. Pinguin Bokep, M.S.B.) CANTIK NYAA", "Indo FC2543 CANTIK NYAA"],
  ["Perpisahan Kantor Koleksi Dr Pinguin Bokep MSB", "Perpisahan Kantor"],
  ["Goyang Muncrat - Dr. Pinguin", "Goyang Muncrat"],
  ["Goyang Muncrat - koleksidrpinguin.com", "Goyang Muncrat"],
  ["Goyang Muncrat - koleksidrpinguin.com - koleksidrpinguin.com", "Goyang Muncrat"],
  ["Goyang Muncrat (Koleksi Dr. Pinguin Bokep, M.S.B.) - koleksidrpinguin.com", "Goyang Muncrat"],
  ["Goyang Muncrat koleksidrpinguin.site", "Goyang Muncrat"],
  ["AI Bokep koleksi_dr_pinguin.com (10)", "AI Bokep (10)"],
  ["Bokep Indo Koleksi Dr. Pinguin SPG Mobil Bodinya Mantep Banget", "Bokep Indo SPG Mobil Bodinya Mantep Banget"],
  ["Bokep Indo Tobrut Ngewe Di Dalam Mobil Koleksi Dr. Pinguin Bokep, M.S.B.)", "Bokep Indo Tobrut Ngewe Di Dalam Mobil"],
  ["Kakak ipar untukku (Koleksi Dr. Pinguin Bokep, M.S.B.) Saya Juga Mauu Part 4", "Kakak ipar untukku Saya Juga Mauu Part 4"],
  ["Pacar Nangis mau di putusin (Koleksi Dr. Pinguin Bokep, M.S", "Pacar Nangis mau di putusin"],
  ["Black Vs White Koleksi Dr. Pinguin Bokep, M.S.B (62)", "Black Vs White (62)"],
  ["Trio Pemersatu Bangsa Msbreewc Dea Party - koleksidrpinguin.com", "Trio Pemersatu Bangsa Msbreewc Dea Party"],
  ["Koleksi Dr. Pinguin Bokep, M.S.B (27)", "Koleksi Dr. Pinguin Bokep, M.S.B (27)"],
  ["Main Sama Pinguin Lucu", "Main Sama Pinguin Lucu"],
  // Isi judul → TIDAK dibuang
  ["Selingkuh dengan Tetangga - Part 2", "Selingkuh dengan Tetangga Part 2"],
  ["Selingkuh dengan Tetangga - Full", "Selingkuh dengan Tetangga Full"],
  ["Tante Seksi Goyang - Viral", "Tante Seksi Goyang Viral"],
  ["Tante Seksi Goyang - Jav", "Tante Seksi Goyang Jav"],
  ["Tante Seksi Goyang - Indo", "Tante Seksi Goyang Indo"],
  ["Ngentot di Kamar Mandi - Ririn Aprilia", "Ngentot di Kamar Mandi Ririn Aprilia"],
  ["SSIS-123 Istri Bos Digoda Karyawan", "SSIS 123 Istri Bos Digoda Karyawan"],
  ["Istri Bos Digoda Karyawan - SSIS-123", "Istri Bos Digoda Karyawan SSIS 123"],
  ["Mandi Bareng Pacar - Bathtub", "Mandi Bareng Pacar Bathtub"],
  ["Gangbang Seru - Group Sex", "Gangbang Seru Group Sex"],
  ["Cewek Bispak Video Call - Telegram Bocor", "Cewek Bispak Video Call Telegram Bocor"],
  ["Cewek Bispak Video Call - Telegram @indobokep", "Cewek Bispak Video Call"],
  ["Cewek Bispak Video Call | Tele: IndoViral", "Cewek Bispak Video Call"],
  ["Cewek Bispak Video Call - Telegram IndoViral44", "Cewek Bispak Video Call"],
  ["Kasir Cantik - Indomaret", "Kasir Cantik Indomaret"],
  ["Viral Tiktok Goyang Hot - Viralnya", "Viral Tiktok Goyang Hot Viralnya"],
  ["Live Bokep Indo Terbaru", "Live Bokep Indo Terbaru"],
  ["Tante Seksi (Part 1)", "Tante Seksi (Part 1)"],
  ["Janda Muda AVTub", "Janda Muda AVTub"],
  // Keamanan / bentuk
  ["<script>alert(1)</script> Tante", "script alert(1) /script Tante"],
  ["Judul: Tante Viral Hotel", "Tante Viral Hotel"],
  ["AVTub", "AVTub"],
  ["", "Video"],
  ["Bokep Indo Terbaru - Bokep Indo", "Bokep Indo Terbaru Bokep Indo"],
  ["Ayang Manja - YouTube", "Ayang Manja"],
  ["Ayang Manja - Sexy", "Ayang Manja Sexy"],
  // Diambil dari katalog asli
  ["Ukhti Masih Polos Digrepe Di Mobil - Kingbokep", "Ukhti Masih Polos Digrepe Di Mobil"],
  ["Cici jaksel binal - NgenTub", "Cici jaksel binal"],
  ["Live Show Selena - XVIDEOS.COM", "Live Show Selena"],
  ["BOkep Tiktik tok tok BY bwka7r.bsky.social", "BOkep Tiktik tok tok"],
  ["MARLBOROQUEENSEX - DI SEPONG MAMAH", "MARLBOROQUEENSEX DI SEPONG MAMAH"],
  ["@nov4prilia (NOVA APRILIA).mp4 (1440)", "@nov4prilia (NOVA APRILIA).mp4 (1440)"],
  ["Ukhti cantik jago main \u{1F3F4}\u200D\u2620\uFE0F", "Ukhti cantik jago main \u{1F3F4}\u200D\u2620\uFE0F"],
  ["Talent Vellyn Ngewe Ditonton Live Tele Koleksi Dr. Pinguin", "Talent Vellyn Ngewe Ditonton Live Tele"],
];

let fail = 0;
for (const [input, base] of cases) {
  const gotBase = cleanUploadTitle(input);
  const gotFinal = brandUploadTitle(input);
  const want = `${base}${S}`;
  const twice = brandUploadTitle(gotFinal);
  const ok = gotBase === base && gotFinal === want && twice === want && (gotFinal.match(/koleksidrpinguin/g) || []).length === 1;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} ${JSON.stringify(input)}\n     → ${JSON.stringify(gotFinal)}${ok ? "" : `\n     want ${JSON.stringify(want)} (base ${JSON.stringify(gotBase)}, twice ${JSON.stringify(twice)})`}`);
}
console.log(`\n${cases.length - fail}/${cases.length} lulus`);
process.exit(fail ? 1 : 0);
