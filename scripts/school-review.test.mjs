import assert from "node:assert/strict";
import test from "node:test";
import { isJavStudioFalsePositive, lockedMinorReason, reviewHitReason } from "../src/lib/catalog/minor-lock.js";

test("school and minor flags are review hits, not a JAV studio false positive", () => {
  assert.equal(reviewHitReason("SISWI *** COLMEK"), "school");
  assert.equal(reviewHitReason("anak sma ngewe"), "minor");
  assert.equal(reviewHitReason(""), "");
});

test("SSNI-559 style studio titles are not auto-blocked", () => {
  const title = "SSNI 559 Para Siswa Melakukan Pelecehan Terhadap Guru Baru";
  assert.equal(isJavStudioFalsePositive(title), true);
  assert.equal(lockedMinorReason(title), "");
  assert.equal(reviewHitReason(title), "");
});

test("a studio code with a hard minor word stays blocked", () => {
  const title = "VEC 384 Janda Diancam Anak SMA";
  assert.equal(isJavStudioFalsePositive(title), false);
  assert.notEqual(lockedMinorReason(title), "");
});

test("flag review actions sit behind owner auth", async () => {
  const fs = await import("node:fs");
  const tools = fs.readFileSync(new URL("../src/routes/api/owner-tools.ts", import.meta.url), "utf8");
  const auth = tools.indexOf("isOwnerRequest");
  const list = tools.indexOf('body.action === "flag-review-list"');
  const decide = tools.indexOf('body.action === "flag-review-decide"');
  assert.ok(auth > 0 && list > auth && decide > auth);
  assert.match(tools, /approveFlagReview/);
  assert.match(tools, /addCatalogBlocked/);
});
