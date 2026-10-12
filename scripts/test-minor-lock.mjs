// Tes kunci judul sekolah/minor yang JELAS (tidak bisa di-Unhide): node scripts/test-minor-lock.mjs
// Exit 1 kalau ada yang gagal. Murni kode, tanpa jaringan.
import { lockedMinorReason } from "../src/lib/catalog/minor-lock.js";

const locked = [
  "SISWI *** COLMEK",
  "SISWI *** COLMEK (1440)",
  "Ngentot Siswi *** Diikat",
  "Cewek SMU Perawan Ngentot",
  "Bokep Indo Terbaru Ngewe Temen Smk (1080)",
  "Abg Indo - Masih Pake Seragam Colmek",
  "Diewe pacar dalam kelas",
  "Fucked Schoolgirl In Her Tight Asshole",
  // Censored / obfuscated spellings
  "S1SWI Cantik Colmek",
  "s!swi nakal",
  "S*SWI viral",
  "s i s w i baru pulang",
  "Cewek Sek0lahan Ngewe",
  "anak sek*lah viral",
  "Pel4jar Mesum",
  "Cewek S.M.P Viral",
  "pr4muka cantik",
  "sch00lgirl hotel",
];

const open = [
  // "sma" typo of "sama" must never be locked
  "Ngewe sma pacar di kos",
  "Main sma tante girang",
  "Ngentot Sma Ayang Sampai Lemes",
  // adult themes
  "Mahasiswi Cantik Checkin Sama Ayang Pulang Kuliah",
  "Bokep Cewek Tocil Habis Jalan jalan",
  "Tante Montok Minta Jatah",
  "Kosmetik Mahal Cewek Cantik",
  "Siswanto Ngewe Istri Tetangga",
  "Kelas Bintang Lima Hotel",
  "ibu kandung ngajak ngewe",
  "Bokep Jilbab *** Ngentot Sampai Memeknya Sakit",
  "",
];

let fail = 0;
for (const t of locked) {
  if (!lockedMinorReason(t)) {
    fail++;
    console.log(`GAGAL (harus dikunci) ${JSON.stringify(t)}`);
  }
}
for (const t of open) {
  const r = lockedMinorReason(t);
  if (r) {
    fail++;
    console.log(`GAGAL (tidak boleh dikunci) ${JSON.stringify(t)} → ${r}`);
  }
}
const total = locked.length + open.length;
console.log(`${total - fail}/${total} lulus`);
process.exit(fail ? 1 : 0);
