// Tes detector minor pemilik + lapisan konteks: node --test scripts/test-minor-detector.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { minorContentReason, isMinorContentTitle, reviewPriority } from "../src/lib/catalog/minor-detector.js";
import { explainTitle, statusOf } from "../src/lib/catalog/minor-context.js";
import { lockedMinorReason } from "../src/lib/catalog/minor-lock.js";

const minor = ["anak sma ngewe", "Video anak di bawah umur", "BALITA", "murid SMP viral", "underage", "anak kecil"];
const review = ["ibu dan anak di kelas", "mahasiswa umur 19", "Ayah dan anak kampus", "keluarga usia muda"];
const clear = ["istri selingkuh", "tante girang", "", "Ngewe sma pacar"];

test("owner detector: minor -> block -> status locked", () => {
  for (const t of minor) {
    assert.equal(minorContentReason(t), "minor", t);
    assert.equal(isMinorContentTitle(t), true, t);
    assert.equal(reviewPriority("", t), "block", t);
    assert.notEqual(lockedMinorReason(t), "", `locked: ${t}`);
    assert.equal(explainTitle(t, minorContentReason(t)).status, "locked", t);
  }
});
test("owner detector: review -> status review_pending", () => {
  for (const t of review) {
    assert.equal(minorContentReason(t), "review", t);
    assert.equal(reviewPriority("", t), "review", t);
    assert.equal(explainTitle(t, "review").status, "review_pending", t);
  }
});
test("owner detector: clear -> status clear", () => {
  for (const t of clear) {
    assert.equal(minorContentReason(t), "", t);
    assert.equal(reviewPriority("", t), "clear", t);
    assert.equal(statusOf(minorContentReason(t)), "clear", t);
  }
});
test("konteks tidak pernah menurunkan 'minor' pemilik", () => {
  // konteks menilai 'clear' (mis. ada kata istri), tapi status tetap locked
  const t = "istri anak sma";
  assert.equal(minorContentReason(t), "minor");
  assert.equal(explainTitle(t, "minor").status, "locked");
});
test("konteks menjelaskan judul review: kata keluarga vs sinyal merah", () => {
  const sloppy = ["Anak Kuliah Kutu Buku", "Melayani anak bos biar dapet jabatan", "Ngentot sama Anak ibu kost",
    "VENU-659 JAV Sub Indo Ibu Anak Tiriku", "ASI Untuk Si Kecil Malah Direbut Ayah", "Anak Kost Kesepian Panggil Ayank"];
  for (const t of sloppy) {
    const e = explainTitle(t, minorContentReason(t));
    assert.equal(e.contextVerdict, "clear", `${t} :: ${e.reason}`);
    assert.match(e.assessment, /salah tulis/);
  }
  const red = ["Anak *** dipake guru olahraga", "abg pakai seragam sekolah", "cewek kelas XI viral", "masih sekolah udah berani",
    "高三 学生 妈妈", "anak pesantren dipaksa gurunya"];
  for (const t of red) assert.equal(explainTitle(t, minorContentReason(t)).contextVerdict, "review", t);
  for (const t of ["bocil viral", "An4k SM4 colmek", "b0cil pamer", "anak s m p", "umur 14 tahun", "萝莉 视频"])
    assert.equal(explainTitle(t, minorContentReason(t)).contextVerdict, "minor", t);
});
test("clear never unlocks existing rules (additive)", () => {
  assert.equal(reviewPriority("", "SISWI *** COLMEK"), "clear");
  assert.notEqual(lockedMinorReason("SISWI *** COLMEK"), "");
  assert.notEqual(lockedMinorReason("S1SWI Cantik Colmek"), "");
});
test("locked tidak bisa ditayangkan lewat Tayangkan (guard di server)", () => {
  const src = readFileSync(new URL("../src/lib/owner-detector-review.ts", import.meta.url), "utf8");
  assert.match(src, /minorContentReason\(title\) === "minor" \|\| isLockedMinor\(it as never\)\) return \{ ok: false, error: "locked_minor", status: 403 \}/);
  // dan item locked tidak masuk kotak Perlu dicek
  assert.match(src, /if \(owner === "minor" \|\| isLockedMinor\(it as never\)\) continue;/);
});

test("label penilaian sesuai sinyal + konsisten dengan penanda dewasa", async () => {
  const { weakAssessment, ownerChecked18 } = await import("../src/lib/catalog/minor-context.js");
  const { hasAdultAgeMarker } = await import("../src/lib/catalog/minor-lock.js");
  assert.equal(weakAssessment("Indo Ngentot Masih Pake Seragam 18yo"), "ada tanda dewasa (18yo/18+)");
  assert.equal(weakAssessment("Seragam kantor nakal"), "cuma kata seragam (bisa seragam kerja/cosplay)");
  assert.match(weakAssessment("Ibu Anak Tiriku"), /^kata keluarga/);
  assert.equal(weakAssessment("Cewek viral hotel"), "sinyal lemah, kemungkinan salah tulis judul");
  for (const t of ["masih pake seragam 18yo", "Indo Ngentot Masih Pake Seragam 18yo", "abg 18 yo", "cewek 19+", "seragam 20 tahun"]) {
    assert.ok(hasAdultAgeMarker(t) && ownerChecked18(t), t);
  }
});
