// Tes kunci judul sekolah/minor yang JELAS (tidak bisa di-Unhide): node scripts/test-minor-lock.mjs
// Exit 1 kalau ada yang gagal. Murni kode, tanpa jaringan.
import { isLockedMinorId, lockedMinorReason, ownerEditBlockReason, hasAdultAgeMarker } from "../src/lib/catalog/minor-lock.js";
import { ownerChecked18, schoolReviewCue } from "../src/lib/catalog/minor-context.js";

// Keputusan pemilik 2026-10-26: isyarat sekolah ini masuk "Perlu dicek" (review), TIDAK dikunci.
const review = ["Abg Indo - Masih Pake Seragam Colmek", "Diewe pacar dalam kelas"];
// Penanda dewasa eksplisit: tidak boleh ditandai isyarat sekolah sama sekali.
const adultNoCue = [
  "Bokep indo Abg 18yo Seragam Mantap Dientot Pasrah",
  "Gadis Kampus Bergoyang Empat Sekawan Di Kelas",
  "Mahasiswi ngewe di kelas",
  "Cewek 19yo masih pake seragam kerja",
  "Dewasa 20an roleplay di dalam kelas",
];

const locked = [
  "SISWI *** COLMEK",
  "SISWI *** COLMEK (1440)",
  "Ngentot Siswi *** Diikat",
  "Cewek SMU Perawan Ngentot",
  "Bokep Indo Terbaru Ngewe Temen Smk (1080)",
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

// Tanda umur 18 = sudah dicek pemilik (keluar dari "Perlu dicek"); bukan tanda umur = tetap.
const age18 = ["Abg 18+ seragam", "Bokep indo Abg 18yo Seragam", "Cewek Indo 18 Tahun Viral", "Abg 18 colmek", "ABG (18) baru lulus"];
const notAge18 = ["Bokep (1080)", "Video 180 menit", "Live 18:30 WIB", "Durasi 18 menit", "Ukuran 18cm", "Part 2018", "Abg Indo - Masih Pake Seragam Colmek"];
let fail = 0;
for (const t of age18) if (!ownerChecked18(t)) { fail++; console.log(`GAGAL (harus dianggap 18) ${JSON.stringify(t)}`); }
for (const t of notAge18) if (ownerChecked18(t)) { fail++; console.log(`GAGAL (bukan tanda umur 18) ${JSON.stringify(t)}`); }
// Tanda 18 tidak pernah membuka kunci lama.
for (const t of ["SISWI 18 COLMEK", "Cewek SMU 18+ Perawan"]) if (!lockedMinorReason(t)) { fail++; console.log(`GAGAL (kunci harus tetap) ${JSON.stringify(t)}`); }
for (const t of review) {
  if (lockedMinorReason(t)) { fail++; console.log(`GAGAL (harus review, bukan kunci) ${JSON.stringify(t)} → ${lockedMinorReason(t)}`); }
  if (!schoolReviewCue(t)) { fail++; console.log(`GAGAL (harus masuk Perlu dicek) ${JSON.stringify(t)}`); }
}
for (const t of adultNoCue) {
  if (schoolReviewCue(t)) { fail++; console.log(`GAGAL (penanda dewasa, tidak boleh ditandai) ${JSON.stringify(t)} → ${schoolReviewCue(t)}`); }
}
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
for (const id of ["4RBCLH2sf4Xe", "jC8azqC8RWMa", "arSsxIQ0WMp9"]) {
  if (!isLockedMinorId(id)) {
    fail++;
    console.log(`GAGAL (id harus dikunci) ${id}`);
  }
}
if (isLockedMinorId("4ZXhcgRSVCT3qX")) {
  fail++;
  console.log("GAGAL (id lain tidak boleh dikunci)");
}
// Owner exception 2026-10-26: school-uniform + adult age marker → not locked, edit allowed.
const uniformAdult = ["🎬 Indo Ngentot Masih Pake Seragam 18yo", "Abg Seragam 18 yo", "Seragam 18yo cantik", "abg seragam 20 tahun"];
for (const t of uniformAdult) {
  if (lockedMinorReason(t) || ownerEditBlockReason(t)) { fail++; console.log(`GAGAL (seragam+18yo harus lolos edit) ${JSON.stringify(t)} → ${lockedMinorReason(t)}|${ownerEditBlockReason(t)}`); }
}
const uniformStill = ["Masih pakai seragam sekolah 19+", "Masih pake seragam sekolah Eps 18", "abg seragam Part 18", "Seragam SMA 18yo", "Siswi SMP seragam 18yo", "anak sd seragam 18+", "di bawah umur seragam 18yo"];
for (const t of uniformStill) {
  if (!ownerEditBlockReason(t)) { fail++; console.log(`GAGAL (harus tetap ditolak) ${JSON.stringify(t)}`); }
}
for (const [t, want] of [["18yo", true], ["18 yo", true], ["19+", true], ["Eps 18", false], ["Part 18", false], ["episode 19+", false]]) {
  if (hasAdultAgeMarker(t) !== want) { fail++; console.log(`GAGAL (penanda umur) ${t}`); }
}
const total = uniformAdult.length + uniformStill.length + 6 + locked.length + open.length + 4 + review.length * 2 + adultNoCue.length + age18.length + notAge18.length + 2;
console.log(`${total - fail}/${total} lulus`);
process.exit(fail ? 1 : 0);
