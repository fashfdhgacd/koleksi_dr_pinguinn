import assert from "node:assert/strict";
import { test } from "node:test";
import { triageLockedTitle } from "../src/lib/catalog/minor-triage.js";

const tier = (t, r = "locked:school") => triageLockedTitle(t, r).tier;

test("explicit youth evidence stays a hard block", () => {
  for (const t of [
    "SISWI *** COLMEK",
    "Cewek SMU Perawan Ngentot",
    "Bokep Indo Dientot Kakak Kelas",
    "Fucked Schoolgirl In Her Tight Asshole",
    "1LDK + JK Ikinari Doukyo Eps 01",
    "IPZZ 567 A devilish J class girl who works",
    "A Certain Molestific Mikoto - Express Assault",
    "Meikoku Gakuen Jutai Hen Eps 02",
    "Abg 15 tahun seragam",
  ])
    assert.equal(tier(t), "explicit", t);
  assert.equal(tier("Janda Diancam Anak SMA", "hidden"), "explicit");
});

test("keyword-only setting words go to verification, never auto-approved", () => {
  for (const t of ["Salam Pramuka Hijab", "Pramuka mengganggu guru", "Cikgu Tudung Di Kamar Mandi Sekolah", "Abg seragam18yo ngewe di kelas"])
    assert.equal(tier(t), "verification", t);
});
