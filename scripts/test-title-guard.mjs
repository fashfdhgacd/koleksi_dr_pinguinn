// Tes filter judul upload: node scripts/test-title-guard.mjs  (exit 1 kalau ada yang gagal)
import { uploadRejectReason, uploadWarnReason } from "../src/lib/bot/title-guard.js";
import { brandUploadTitle } from "../src/lib/bot/title-brand.js";

// [judul, "reject" | "warn" | "ok"]
const cases = [
  ["Bocil ngewe di kamar", "reject"],
  ["Anak kecil disuruh nyepong", "reject"],
  ["Siswi SMA open BO", "reject"],
  ["Anak Sma Ngga Buat Tugas Dihukum Guru", "reject"],
  ["Murid SMP colmek", "reject"],
  ["Cewek SD viral", "reject"],
  ["Video di bawah umur", "reject"],
  ["underage girl", "reject"],
  ["child porn", "reject"],
  ["Kids at home", "reject"],
  ["preteen model", "reject"],
  ["Loli hentai", "reject"],
  ["Japanese schoolgirl uniform", "reject"],
  ["Mama Tiri Ngentotin Anak Kontol Gede Belum Sunat", "reject"],
  ["แตกในนักเรียนสาววัยทีน", "reject"],
  ["anak pesantren jilbab digenjot gurunya", "warn"],
  ["Santriwati cantik colmek", "warn"],
  ["Pelajar kos ngewe", "warn"],
  ["Gadis Asia diperkosa tanpa kondom", "warn"],
  ["Tukang Pijit Dipaksa Muasin Nafsu", "warn"],
  ["forced sex", "warn"],
  ["Bokep Istri Lagi Tidur Disodok Dari Belakang", "warn"],
  ["stepsister sleeping", "warn"],
  ["Nilasing ako ni insan para isubo titi ko", "warn"],
  ["cewek mabuk di club", "warn"],
  ["dibius temen", "warn"],
  ["Cikgu Tudung Melayu Colmek Di Kamar Mandi Sekolah", "warn"],
  ["Video Desahan Enak Bu Guru Syumilde", "ok"],
  ["Tante selingkuh kena crot", "ok"],
  ["Mahasiswi kos ngewe", "ok"],
  ["Cewek 18+ Hijab Jago Wot", "ok"],
  ["Smash bareng pacar", "ok"],
  ["Sdh lama gak ngewe", "ok"],
  ["Kakek vs 2 wanita muda", "ok"],
  ["Ukhti Leona Tiktok Jilbab Binal", "ok"],
];

let fail = 0;
for (const [title, want] of cases) {
  const r = uploadRejectReason(title);
  const w = uploadWarnReason(title);
  const got = r ? "reject" : w ? "warn" : "ok";
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} ${want.padEnd(6)} ${JSON.stringify(title)}${ok ? "" : ` → ${got} (${r || w})`}`);
}

// teenager(s) -> 18+
const age = [
  ["Hot teenager couple", "Hot 18+ couple"],
  ["Cewek teenagers pesta", "Cewek 18+ pesta"],
  ["ABG Hijab", "Cewek 18+ Hijab"],
];
for (const [input, base] of age) {
  const got = brandUploadTitle(input);
  const ok = got === `${base} - koleksidrpinguin.com`;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FAIL"} 18+    ${JSON.stringify(input)} → ${JSON.stringify(got)}`);
}

const total = cases.length + age.length;
console.log(`\n${total - fail}/${total} lulus`);
process.exit(fail ? 1 : 0);
