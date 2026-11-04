import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyRestriction, triageLockedTitle } from "../src/lib/catalog/minor-triage.js";

test("school/uniform/anime words are context only, never an age claim", () => {
  for (const t of [
    "SISWI *** COLMEK",
    "Cewek SMU Perawan Ngentot",
    "Bokep Indo Dientot Kakak Kelas",
    "Fucked Schoolgirl In Her Tight Asshole",
    "1LDK + JK Ikinari Doukyo Eps 01",
    "A Certain Molestific Mikoto - Express Assault",
    "Meikoku Gakuen Jutai Hen Eps 02",
    "Salam Pramuka Hijab",
    "Abg seragam18yo ngewe di kelas",
  ]) {
    const c = classifyRestriction(t);
    assert.equal(c.hardBlock, false, t);
    assert.notEqual(c.performerAge.claim, "claims_minor", t);
    assert.equal(c.verification, "unverified", t);
    assert.ok(c.contextKeywords.length > 0 || c.fictionalCharacter.framing === "fiksi/anime", t);
  }
});

test("explicit minor claims are a hard block", () => {
  for (const t of ["Abg 15 tahun seragam", "video di bawah umur", "Anak SMP colmek", "loli anime eps 1"])
    assert.equal(classifyRestriction(t).hardBlock, true, t);
  assert.equal(classifyRestriction("Janda Diancam Anak SMA", { detector: true }).hardBlock, true);
});

test("adult marker is reported as a claim, not as proof, and fiction age is kept separate", () => {
  const c = classifyRestriction("Abg seragam 18yo di kelas");
  assert.equal(c.performerAge.claim, "claims_adult");
  assert.equal(c.hardBlock, false);
  const f = classifyRestriction("Gakuen anime eps 2 17 tahun");
  assert.equal(f.fictionalCharacter.statedAge, 17);
  assert.equal(f.hardBlock, true);
});

test("panel summary", () => {
  assert.equal(triageLockedTitle("Pramuka mengganggu guru").tier, "verification");
  assert.equal(triageLockedTitle("Anak SMP colmek").tier, "explicit");
});
