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

test("AI Indo: never for child/school wording or 'your mom' scenes", () => {
  assert.equal(isIndoAiTitle("Siswi Sekolah Bokep Indo"), false);
  assert.equal(isIndoAiTitle("Abg Bokep Indo"), false);
  assert.equal(isIndoAiTitle("Om Minta Dimasukin Keburu Mamahmu Pulang Bokep Indo"), false);
  assert.equal(isIndoAiTitle("Bokep indo Budak Saha Intip Mandi"), false);
  assert.equal(isIndoAiTitle("Bokep indo Cewek 18yo Di Kelas"), false);
});
