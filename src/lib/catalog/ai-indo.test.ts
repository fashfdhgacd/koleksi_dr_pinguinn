import assert from "node:assert/strict";
import { test } from "node:test";
import { isIndoAiTitle } from "./title-text.ts";

test("AI Indo: Indonesian AI titles join, others do not", () => {
  assert.equal(isIndoAiTitle("Tante Girang Minta Jatah Bokep Indo"), true);
  assert.equal(isIndoAiTitle("Video AI Indonesia Terbaru"), true);
  assert.equal(isIndoAiTitle("AI China Short Drama Episode 3"), false);
  // Brand/template text alone is not "Indonesian wording".
  assert.equal(isIndoAiTitle("Video Viral Videy Indo Terbaru 12"), false);
  assert.equal(isIndoAiTitle(""), false);
  assert.equal(isIndoAiTitle(undefined), false);
});

test("AI Indo: adult AI titles with mistranslated words are included (owner 2026-11-02)", () => {
  for (const t of [
    "Om Minta Dimasukin Keburu Mamahmu Pulang Bokep Indo",
    "Bokep indo Bokep Budak Saha Intip Ayah Mandi Disungai Diajakain Ngentot Mau (Koleksi Dr. Pinguin Bokep, M.S.B.) AI",
    "Bokep Indo Drama Ibu Tiri Mom Itha Les Privat Ngentub Ganas - koleksidrpinguin.com",
    "Bokep Indo Skandal Tante Hijab Vs Keponakan",
    "Anak Kos Bokep Indo",
  ]) assert.equal(isIndoAiTitle(t), true, t);
});

test("AI Indo: REVIEW_PENDING titles (age unconfirmed) stay out until the owner approves", () => {
  // Owner decision 2026-11-02: a title's own "18yo" claim is not verification.
  assert.equal(isIndoAiTitle("Bokep indo Jedag Jedug Cewek 18yo Hijab Digangbang Di Kelas (Koleksi Dr. Pinguin Bokep, M.S.B.) AI"), false);
  assert.equal(isIndoAiTitle("Abg 18yo Bokep Indo"), false);
  assert.equal(isIndoAiTitle("Andini Permata Bokep Indo"), false);
  assert.equal(isIndoAiTitle("Bokep Indo Anak *** Colmek"), false);
});

test("AI Indo: explicit minor signals or unclear age stay out", () => {
  assert.equal(isIndoAiTitle("Siswi Sekolah Bokep Indo"), false);
  assert.equal(isIndoAiTitle("Anak SMP Bokep Indo"), false);
  assert.equal(isIndoAiTitle("Cewek 16 Tahun Bokep Indo"), false);
  assert.equal(isIndoAiTitle("Budak Sekolah Bokep Indo"), false);
  assert.equal(isIndoAiTitle("Abg Bokep Indo"), false); // age unclear: held at upload too
});
