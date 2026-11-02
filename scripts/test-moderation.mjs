// Tes keputusan moderasi upload (catalog/moderation.js, aturan pemilik 2026-11-02):
// node scripts/test-moderation.mjs  (exit 1 kalau ada yang gagal)
import { uploadModeration } from "../src/lib/catalog/moderation.js";
import { titleHold, waivedHoldTerm } from "../src/lib/bot/title-hold.js";
import { REVIEW_PENDING_IDS, isReviewPendingReason, reviewPendingReason } from "../src/lib/catalog/review-pending.js";

let fail = 0;
let n = 0;
const check = (ok, msg) => {
  n += 1;
  if (!ok) {
    fail += 1;
    console.error(`GAGAL: ${msg}`);
  }
};

// Terjemahan AI yang salah / kata ambigu: tayang, tidak ditahan.
for (const t of [
  "Om Minta Dimasukin Keburu Mamahmu Pulang Bokep Indo",
  "Bokep indo Bokep Budak Saha Intip Ayah Mandi Disungai Diajakain Ngentot Mau",
  "Bokep Indo Drama Ibu Tiri Mom Itha Les Privat Ngentub Ganas",
  "Bokep Indo Skandal Tante Hijab Vs Keponakan",
  "Budak Melayu Main Di Hotel",
  "Mahasiswi Kampus Colmek",
  "Cewek Muda Cantik",
]) {
  const m = uploadModeration(t);
  check(!m.hide, `${t} harus tayang (hide=${m.hide})`);
}

// Sinyal lemah + klaim 18yo: tayang, masuk "Perlu dicek" dengan alasan (belum terverifikasi).
for (const t of ["Bokep indo Jedag Jedug Cewek 18yo Hijab Digangbang Di Kelas", "Anak Tiri 18yo Diajak Ngewe", "Guru Les 18+ Di Kelas Kosong"]) {
  const m = uploadModeration(t);
  check(m.hide.startsWith("review-pending: ") && m.review, `${t} harus REVIEW_PENDING (ditahan) + Perlu dicek (${JSON.stringify(m)})`);
}
// Kata keluarga dewasa tanpa konteks anak: tayang biasa (satu kata bukan bukti).
check(!uploadModeration("Anak Kos Ngewe").hide && !uploadModeration("Anak Kos Ngewe").review, "anak kos: tayang");

// Umur tidak jelas, tanpa klaim dewasa: ditahan untuk pemilik (bukan dikunci).
check(uploadModeration("Cewek Di Kelas Sepi").hide === "classroom", "di kelas tanpa umur: ditahan");
check(uploadModeration("Cewek 16 Tahun").hide === "detector-review", "16 tahun: ditahan");
check(uploadModeration("Cewek 16 Tahun 18yo").hide === "detector-review", "16 tahun + 18yo: tetap ditahan");
check(uploadModeration("Cewek 15yo").hide !== "", "15yo: ditahan");

// Minor jelas: tetap dikunci/diblokir walau ada 18yo.
for (const t of ["Anak SMP", "Siswi 18yo", "Budak Sekolah", "Loli 18+", "Seragam SMA 18yo", "Anak di bawah umur 18yo"]) {
  const m = uploadModeration(t);
  check(m.hide && !m.review, `${t} harus ditahan/dikunci (${JSON.stringify(m)})`);
}

// title-hold: kata umur ambigu (teen/ABG/student) + umur dewasa tidak ditahan, tapi dicatat.
check(titleHold("Teen 18yo Colmek") === null && waivedHoldTerm("Teen 18yo Colmek") === "teenager", "teen 18yo: lolos + dicatat");
check(titleHold("ABG 18+ Viral") === null && waivedHoldTerm("ABG 18+ Viral") === "abg", "abg 18+: lolos + dicatat");
check(titleHold("Abg Viral")?.term === "abg", "abg tanpa umur: tetap ditahan");
check(titleHold("Teen Part 18")?.term === "teenager", "Part 18 bukan umur");
check(titleHold("High School 18yo")?.term === "high school", "high school tetap ditahan walau 18yo");
check(titleHold("Seragam Sekolah 18yo")?.term === "seragam sekolah", "seragam sekolah tetap ditahan");
check(waivedHoldTerm("Cewek 18yo") === "", "tanpa kata ambigu: tidak dicatat");

// REVIEW_PENDING (keputusan pemilik 2026-11-02): ditahan, data tetap, disetujui pemilik dengan bukti.
for (const id of ["fU9dgPetb226", "SQpz6PgD4MUt", "KCKHCOSFfzg5"]) {
  check(REVIEW_PENDING_IDS[id] && isReviewPendingReason(reviewPendingReason(id, ["judul apa saja"])), `${id} (Andini Permata) REVIEW_PENDING`);
}
check(isReviewPendingReason(reviewPendingReason("x", ["Video Andini Permata Viral"])), "nama Andini Permata: REVIEW_PENDING");
check(isReviewPendingReason(reviewPendingReason("x", ["Bokep Indo Anak *** Colmek"])), "anak ***: REVIEW_PENDING");
check(isReviewPendingReason(reviewPendingReason("x", ["Abg 18yo Bokep Indo"])), "abg + 18yo: REVIEW_PENDING");
check(isReviewPendingReason(reviewPendingReason("x", ["Ibu dan Anak"])), "ibu + anak: REVIEW_PENDING");
check(reviewPendingReason("x", ["Anak Kos Ngewe"]) === "", "anak kos: tidak ditahan");
check(reviewPendingReason("x", ["Cewek 18yo Hijab"]) === "", "18yo tanpa sinyal lain: tidak ditahan");
check(reviewPendingReason("x", ["Budak Melayu Colmek"]) === "", "budak (Melayu): tidak ditahan");
check(reviewPendingReason("x", ["Anak SMP 18yo"]) === "", "minor eksplisit: bukan review, tetap terkunci");
check(uploadModeration("Anak SMP 18yo").hide.startsWith("locked:"), "minor eksplisit tetap terkunci saat upload");

console.log(fail ? `${fail}/${n} GAGAL` : `OK ${n}/${n}`);
process.exit(fail ? 1 : 0);
