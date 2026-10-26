// Tes detector minor milik pemilik: node --test scripts/test-minor-detector.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { minorContentReason, isMinorContentTitle, reviewPriority } from "../src/lib/catalog/minor-detector.js";
import { lockedMinorReason } from "../src/lib/catalog/minor-lock.js";

const minor = ["anak sma ngewe", "Video anak di bawah umur", "BALITA", "murid SMP viral", "underage", "anak kecil"];
const review = ["ibu dan anak di kelas", "mahasiswa umur 19", "Ayah dan anak kampus", "keluarga usia muda"];
const clear = ["istri selingkuh", "tante girang", "", "Ngewe sma pacar"];

test("minor -> block", () => {
  for (const t of minor) {
    assert.equal(minorContentReason(t), "minor", t);
    assert.equal(isMinorContentTitle(t), true, t);
    assert.equal(reviewPriority("", t), "block", t);
    assert.equal(lockedMinorReason(t) !== "", true, `locked: ${t}`);
  }
});
test("review -> manual check", () => {
  for (const t of review) {
    assert.equal(minorContentReason(t), "review", t);
    assert.equal(isMinorContentTitle(t), false, t);
    assert.equal(reviewPriority("", t), "review", t);
  }
});
test("clear -> not blocked by this detector", () => {
  for (const t of clear) {
    assert.equal(minorContentReason(t), "", t);
    assert.equal(reviewPriority("", t), "clear", t);
  }
  assert.equal(reviewPriority("minor", "istri selingkuh"), "block");
  assert.equal(reviewPriority("REVIEW", "istri selingkuh"), "review");
});
test("clear never unlocks existing rules (additive)", () => {
  assert.equal(reviewPriority("", "SISWI *** COLMEK"), "clear");
  assert.notEqual(lockedMinorReason("SISWI *** COLMEK"), "");
  assert.notEqual(lockedMinorReason("S1SWI Cantik Colmek"), "");
});
