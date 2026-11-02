// Owner decisions in /pemilik "Perlu dicek" win over automatic checks (owner rule 2026-11-02).
import test from "node:test";
import assert from "node:assert/strict";
import { effectiveHidden, recordDecision, newerDecisions, reviewGroup, healDecisions, triggerText } from "../src/lib/owner-decisions.js";
import { reviewPendingReason } from "../src/lib/catalog/review-pending.js";
import { lockedMinorReason } from "../src/lib/catalog/minor-lock.js";

const TITLE = "Anak jaman sekarang nakal";

test("approved video stays approved (and public) after the checks re-run", () => {
  // 1. The automatic check holds it.
  const before = reviewPendingReason("vid001", [TITLE]);
  assert.match(before, /^review-pending:/);
  assert.equal(effectiveHidden({ reason: before }), true);
  assert.equal(reviewGroup({}), "pending");
  // 2. Owner taps Tayangkan: decision ledger + Unhide.
  const decisions = recordDecision({}, "vid001", "show", { title: TITLE, now: 1000 });
  const unhide = { vid001: { at: 1000 } };
  // 3. Checks re-run later (new deploy / cache rebuild): still flag the title...
  const after = reviewPendingReason("vid001", [TITLE]);
  assert.equal(after, before);
  // ...but the owner decision wins: public, and listed under "Sudah disetujui", never back in "Perlu dicek".
  assert.equal(effectiveHidden({ unhidden: Boolean(unhide.vid001), reason: after }), false);
  assert.equal(reviewGroup({ decision: decisions.vid001, unhidden: true }), "approved");
  assert.equal(reviewGroup({ decision: decisions.vid001, unhidden: false }), "approved");
  assert.equal(decisions.vid001.at, 1000);
});

test("approval lost from the Unhide list by a stale KV write is restored from the ledger", () => {
  const decisions = recordDecision(recordDecision({}, "a", "show", { now: 1 }), "b", "keep", { now: 2 });
  const heal = healDecisions(decisions, { unhide: {}, ownerHide: {} });
  assert.deepEqual(heal, { unhide: ["a"], hide: ["b"] });
  assert.deepEqual(healDecisions(decisions, { unhide: { a: 1 }, ownerHide: { b: 1 } }), { unhide: [], hide: [] });
  // A second quick decision read a stale ledger: the newer write of this isolate is kept.
  const merged = newerDecisions({ b: { d: "keep", at: 2 } }, decisions);
  assert.equal(merged.a.d, "show");
});

test("Tetap tahan = held for good; hard minor locks still win over an approval", () => {
  const keep = recordDecision({}, "c", "keep", { now: 5 });
  assert.equal(reviewGroup({ decision: keep.c, ownerHidden: true }), "held");
  assert.equal(effectiveHidden({ ownerHidden: true, reason: "" }), true);
  const locked = lockedMinorReason("video anak SMP");
  assert.ok(locked);
  assert.equal(effectiveHidden({ locked: Boolean(locked), unhidden: true }), true);
  assert.deepEqual(healDecisions(recordDecision({}, "d", "show"), { unhide: {}, ownerHide: {}, locked: () => true }).unhide, []);
});

test("trigger text shows just the word that held it", () => {
  assert.equal(triggerText(reviewPendingReason("vid001", [TITLE])), '"anak jaman sekarang" (biasanya soal remaja)');
});

test("the public catalog filter uses the same owner-wins rule", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/lib/catalog/local-cache.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function isHiddenRaw("), src.indexOf("function isHiddenRaw(") + 400);
  assert.match(fn, /effectiveHidden\(\{/);
  assert.match(fn, /unhidden: UNHIDDEN\.has\(it\.id\)/);
});

test("one-tap Tayangkan: only hard minor content and the strict set are refused (source guard)", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/lib/owner-detector-review.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function approvalBlock("), src.indexOf("export async function approveDetectorReviewBulk"));
  assert.doesNotMatch(fn, /title_needs_rename/); // a rename-held draft is approved by the owner's tap
  assert.match(fn, /locked_minor/);
  assert.match(fn, /proof_required/);
  // JAV with "19 year old ... college student" is adult by default: not strict, so no proof needed.
  const { strictPendingReason: strict } = await import("../src/lib/catalog/review-pending.js");
  const jav = "START 005 A sparkling 19 year old active female college student with dazzling baby faced G cup big breasts Nanase Aoi AV DEBUT";
  assert.equal(strict("4kemWbJHGt", [jav], "jav"), "");
  assert.equal(reviewPendingReason("4kemWbJHGt", [jav], { category: "jav" }), "");
});
