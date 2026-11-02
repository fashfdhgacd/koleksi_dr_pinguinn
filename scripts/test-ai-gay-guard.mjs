// Regression (owner report 2026-11-03): a batch with a message-level AI GAY signal put 32 straight
// IndoAV/UserBokep uploads into /kategori/ai-gay. Run: node scripts/test-ai-gay-guard.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { guardGivenCategory, hasGayCue } from "../src/lib/bot/category-guard.js";
import { parseMessage } from "../src/lib/bot/parse.js";

const straight = [
  "Bokep Indo Miss Beelzewbub Tiktokers Tobrut Ngentot Pake Lingerie Hitam",
  "KOMPLIKASI GAYA WOT... Gampang Crot Kalau Dia gaya Wot Soalnya Genjotnya enak",
  "Perjalanan Bisnis Ayah Episode 3",
  "Mertua Sange Sampai Menantu Diajak Ngentot",
];

test('"gaya" is not a gay cue', () => {
  assert.equal(hasGayCue("gaya wot"), false);
  assert.equal(hasGayCue("KOMPLIKASI GAYA WOT"), false);
});

test("real Boy Friend TV titles are gay cues", () => {
  for (const t of [
    "FAY LOKAL 143 ( Koleksi Dr. Boy Friend TV, G. Y. B. )",
    "Hot lokal indo brondong sixpack BoyFriendTV",
    "Gay lokal indonesia",
  ])
    assert.equal(hasGayCue(t), true, t);
});

test("batch-wide AI GAY does not stick to straight titles", () => {
  for (const title of straight) {
    assert.equal(guardGivenCategory("ai-gay", { title, batchSize: 32 }), "", title);
    assert.equal(guardGivenCategory("ai gay", { title, batchSize: 32 }), "", title);
  }
});

test("AI GAY sticks to gay titles in a batch, and to a single deliberate upload", () => {
  assert.equal(
    guardGivenCategory("ai-gay", { title: "Gay lokal indonesia", batchSize: 10 }),
    "ai-gay",
  );
  assert.equal(
    guardGivenCategory("ai-gay", { title: "Perjalanan Bisnis Ayah Episode 3", batchSize: 1 }),
    "ai-gay",
  );
});

test("other categories pass through unchanged", () => {
  assert.equal(guardGivenCategory("ai-plus", { title: straight[0], batchSize: 32 }), "ai-plus");
  assert.equal(guardGivenCategory("", { title: straight[0], batchSize: 32 }), "");
});

test("parseMessage: no AI GAY signal => no ai-gay category, even with 'gaya'", () => {
  const msg = parseMessage("https://tv1.indoav.app/e/QhA98Rx5t0Kt\nKOMPLIKASI GAYA WOT gaya enak");
  assert.notEqual(msg.category, "ai-gay");
});
