// Tes judul upload bot: node scripts/test-title-brand.mjs  (exit 1 kalau ada yang gagal)
import { brandUploadTitle, cleanUploadTitle, isPlaceholderTitle } from "../src/lib/bot/title-brand.js";
import { parseMessage } from "../src/lib/bot/parse.js";

const S = " - koleksidrpinguin.com";
const cases = [
  // Rentang episode: tanda hubung dipertahankan jadi " - "; tanpa tanda hubung tidak diubah
  ["Pasangan Seks Saya Seorang Dokter Kandungan Episode 1- 2", "Pasangan Seks Saya Seorang Dokter Kandungan Episode 1 - 2"],
  ["Pasangan Seks Saya Seorang Dokter Kandungan Episode 1-2", "Pasangan Seks Saya Seorang Dokter Kandungan Episode 1 - 2"],
  ["Pasangan Seks Saya Seorang Dokter Kandungan Episode 1 -2", "Pasangan Seks Saya Seorang Dokter Kandungan Episode 1 - 2"],
  ["Pasangan Seks Saya Seorang Dokter Kandungan Episode 1 - 2", "Pasangan Seks Saya Seorang Dokter Kandungan Episode 1 - 2"],
  ["Pasangan Seks Saya Seorang Dokter Kandungan Episode 1 - 2 - koleksidrpinguin.com", "Pasangan Seks Saya Seorang Dokter Kandungan Episode 1 - 2"],
  ["Pasangan Seks Saya Seorang Dokter Kandungan Episode 12", "Pasangan Seks Saya Seorang Dokter Kandungan Episode 12"],
  ["Pasangan Seks Saya Seorang Dokter Kandungan Episode 1 2", "Pasangan Seks Saya Seorang Dokter Kandungan Episode 1 2"],
  ["AI drama China - Kebangkitan paman EP1-2 di dapur - AVTub", "AI drama China Kebangkitan paman EP1 - 2 di dapur"],
  ["Drama Kantor Eps 3 – 4 | BokepHot", "Drama Kantor Eps 3 - 4"],
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
  // Nama situs saja = placeholder (dulu dibiarkan; sejak 2026-10-19 dianggap tanpa judul)
  ["AVTub", "Video"],
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
  // Judul placeholder (judul halaman situs sumber, nama situs, nama file) → "Video" (= tanpa judul)
  ["Jelajahi video ExaStream (3)", "Video"],
  ["Jelajahi video — ExaStream", "Video"],
  ["Jelajahi video ExaStream", "Video"],
  ["Watch video", "Video"],
  ["Video player", "Video"],
  ["ExaStream", "Video"],
  ["Untitled", "Video"],
  ["video.mp4", "Video"],
  ["VID_20241003_221500.mp4", "Video"],
  // Bukan placeholder → tetap
  ["Video Ngewe Di Dalem Mobil - KingBokep", "Video Ngewe Di Dalem Mobil"],
  ["Watch Me Colmek Pake Sisir", "Watch Me Colmek Pake Sisir"],
  ["Koleksi Dr. Pinguin Bokep 13", "Koleksi Dr. Pinguin Bokep 13"],
  ["Mainstream Indo Viral", "Mainstream Indo Viral"],
  // Judul Mandarin / CJK → persis apa adanya (tidak diterjemahkan, tidak dibuang, tidak jadi placeholder)
  ["AI成人短剧契约魔法美女就能不断变强 被操到高潮 A片", "AI成人短剧契约魔法美女就能不断变强 被操到高潮 A片"],
  ["AI成人短剧契约魔法美女就能不断变强 被操到高潮 A片 - koleksidrpinguin.com", "AI成人短剧契约魔法美女就能不断变强 被操到高潮 A片"],
  ["AI成人短剧契约魔法美女就能不断变强 被操到高潮 A片 - AVTub", "AI成人短剧契约魔法美女就能不断变强 被操到高潮 A片"],
  ["AI成人短剧契约魔法美女就能不断变强 被操到高潮 A片 (Koleksi Dr. Pinguin Bokep, M.S.B.)", "AI成人短剧契约魔法美女就能不断变强 被操到高潮 A片"],
  ["龍女奇遇記 龍女凡人奇遇 ai短剧 龙女情欲故事 奇遇缠绵 A片", "龍女奇遇記 龍女凡人奇遇 ai短剧 龙女情欲故事 奇遇缠绵 A片"],
  ["禁忌的喘息2 第1集 禁忌喘息交织 ai短剧 禁忌情欲故事 喘息缠绵 A片", "禁忌的喘息2 第1集 禁忌喘息交织 ai短剧 禁忌情欲故事 喘息缠绵 A片"],
  ["绝美古装蕾丝美女双飞诱惑成人短劇重磅大作震撼上映完美 A片", "绝美古装蕾丝美女双飞诱惑成人短劇重磅大作震撼上映完美 A片"],
  ["契约魔法｜第1集", "契约魔法｜第1集"],
  ["契约魔法 — 第1集", "契约魔法 — 第1集"],
  ["龍女", "龍女"],
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
// Upload Telegram (link + judul satu baris / baris judul di atas link / "judul:"): judul CJK utuh
const CJK = "AI成人短剧契约魔法美女就能不断变强 被操到高潮 A片";
const msgs = [
  [`https://byse.sx/d/abc123 ${CJK}`, "byse"],
  [`https://luluvdo.com/abc123def ${CJK}`, "lulu"],
  [`${CJK}\nhttps://byse.sx/d/abc123`, "byse"],
  [`judul: ${CJK}\nhttps://dood.to/d/abc123`, "dood"],
  [`https://videy.co/v?id=AbCd1234 ${CJK}`, "videy"],
];
for (const [msg, host] of msgs) {
  const v = parseMessage(msg).videos[0] || {};
  const ok = v.host === host && v.title === CJK && brandUploadTitle(v.title) === `${CJK}${S}` && !isPlaceholderTitle(v.title);
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} pesan ${host}: ${JSON.stringify(v.title)}`);
}

// LuluStream mirror domains (luluvido.com share links, /d/ /e/ /<code>) -> same lu-<code> id, luluvdo.com embed
const luluLinks = [
  ["https://luluvido.com/d/mgul1d816cvk", "mgul1d816cvk"],
  ["https://luluvido.com/d/8j2mu6sd5638", "8j2mu6sd5638"],
  ["https://luluvido.com/mgul1d816cvk", "mgul1d816cvk"],
  ["https://luluvido.com/e/mgul1d816cvk", "mgul1d816cvk"],
  ["https://www.luluvido.com/d/mgul1d816cvk", "mgul1d816cvk"],
  ["https://lulustream.com/mgul1d816cvk", "mgul1d816cvk"],
  ["https://lulustream.com/e/mgul1d816cvk", "mgul1d816cvk"],
  ["https://luluvdo.com/e/mgul1d816cvk", "mgul1d816cvk"],
  ["https://luluvdo.com/d/mgul1d816cvk", "mgul1d816cvk"],
  ["https://lulu.st/mgul1d816cvk", "mgul1d816cvk"],
  ["https://luluvid.com/e/mgul1d816cvk", "mgul1d816cvk"],
];
for (const [url, code] of luluLinks) {
  const v = parseMessage(`${url} ${CJK}`).videos[0] || {};
  const ok = v.host === "lulu" && v.id === `lu-${code}` && v.embed === `https://luluvdo.com/e/${code}` && v.title === CJK;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} lulu ${url} -> ${v.id} ${v.embed}`);
}

const total = cases.length + msgs.length + luluLinks.length;
console.log(`\n${total - fail}/${total} lulus`);
process.exit(fail ? 1 : 0);
