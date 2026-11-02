// Owner title edits vs. the automatic title check (owner rules 2026-11-02).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { withSavedEdit, newerEdits } from "../src/lib/catalog/owner-edit-merge.js";
import { reviewPendingReason, strictPendingReason, releasedByOwnerTitle } from "../src/lib/catalog/review-pending.js";
import { ownerTitleReleases, uploadModeration } from "../src/lib/catalog/moderation.js";
import { isHeldDraftReason } from "../src/lib/bot/title-hold.js";

test("stuck edit: a stale cached read no longer drops the edit that was just saved", () => {
  const stale = { a: { title: "Judul lama", at: 1 } };
  const saved = { title: "Judul baru", at: 2 };
  // Before the fix the route rebuilt the catalog from `stale`, so the new title vanished.
  assert.equal(withSavedEdit(stale, "a", saved).a.title, "Judul baru");
  assert.equal(withSavedEdit(stale, "a", null).a, undefined);
  // Second quick edit (category) read the stale copy and wrote it back over the title edit.
  const merged = newerEdits(stale, { a: saved });
  assert.equal(merged.a.title, "Judul baru");
  assert.equal(newerEdits({ a: { title: "x", at: 5 } }, { a: saved }).a.title, "x");
});

test("a clean owner title releases a review-pending video; without one it stays pending", () => {
  const pending = reviewPendingReason("t1", ["ibu dan anak menikmati waktu bersama"], { category: "bokep" });
  assert.match(pending, /^review-pending/);
  assert.equal(reviewPendingReason("t1", ["ibu dan anak menikmati waktu bersama"], { ownerTitle: "Drama Keluarga Panas Teater Huangguo Episode 1", category: "bokep" }), "");
});

test("strict items stay pending even with a clean owner title", () => {
  const owner = { ownerTitle: "Cewek Cantik Viral", category: "abg" };
  assert.match(reviewPendingReason("x1", ["Anak *** dipaksa puasin tante"], owner), /^review-pending/);
  assert.match(reviewPendingReason("x2", ["Andini Permata viral"], owner), /Andini/);
  assert.match(reviewPendingReason("x3", ["ayah ngentot anak nya"], owner), /^review-pending/);
  assert.ok(strictPendingReason("x1", ["Anak *** dipaksa"], "abg"));
  assert.equal(strictPendingReason("x4", ["ASI Untuk Si Kecil Malah Direbut Ayah"], "umum"), "");
});

test("strong signals alone never turn a harder hide into review-pending", () => {
  assert.equal(reviewPendingReason("x5", ["Abg Indo - Masih Pake Seragam Colmek"], { category: "abg" }), "");
});

test("JAV is adult by default: genre words do not hold, an explicit age under 18 does", () => {
  for (const t of ["SSIS-123 student teen di kelas", "START-005 schoolgirl roleplay"]) {
    assert.equal(reviewPendingReason("j1", [t], { category: "jav" }), "");
  }
  assert.equal(reviewPendingReason("j2", ["female college student"], { category: "jav" }), "");
  assert.equal(uploadModeration("SSIS-123 student teen di kelas", { category: "jav" }).hide, "");
  assert.notEqual(uploadModeration("SSIS-123 gadis 15 tahun", { category: "jav" }).hide, "");
});

test("owner title releases only automatic holds, never minor locks", () => {
  assert.equal(releasedByOwnerTitle("review-pending: x"), true);
  assert.equal(releasedByOwnerTitle("title-rename"), true);
  assert.equal(releasedByOwnerTitle("detector-minor"), false);
  assert.equal(ownerTitleReleases("title-rename", "Cewek Hijab Colmek Viral"), true);
  assert.equal(ownerTitleReleases("review-pending: kata anak", "Cewek Hijab Colmek Viral"), true);
  assert.equal(ownerTitleReleases("school-uniform", "Cewek Hijab Colmek Viral"), false);
  assert.equal(ownerTitleReleases("title-rename", "siswi SMP colmek"), false);
});

test("held drafts include review-pending and detector-review", () => {
  assert.equal(isHeldDraftReason("review-pending: x"), true);
  assert.equal(isHeldDraftReason("detector-review"), true);
  assert.equal(isHeldDraftReason(""), false);
});

test("editing is never blocked: edit APIs save held/locked videos instead of returning 403", () => {
  const tools = fs.readFileSync(new URL("../src/routes/api/owner-tools.ts", import.meta.url), "utf8");
  const videy = fs.readFileSync(new URL("../src/routes/api/owner-videy.ts", import.meta.url), "utf8");
  const edit = tools.slice(tools.indexOf("handleEditVideo"), tools.indexOf("handleEditVideo") + 6000);
  const save = videy.slice(videy.indexOf("saveTitle"), videy.indexOf("saveTitle") + 4000);
  for (const src of [edit, save]) {
    assert.ok(src.length > 100);
    assert.doesNotMatch(src, /status:\s*403/);
    assert.match(src, /setOwnerEdit/);
  }
});
