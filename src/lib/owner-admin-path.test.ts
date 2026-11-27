import { test } from "node:test";
import assert from "node:assert/strict";
import { isOwnerAdminPath } from "./owner-admin-path.ts";
import { isAdFreePath } from "./catalog/landing.ts";

test("owner / admin / login / API paths are excluded from ad scripts", () => {
  for (const p of [
    "/pemilik",
    "/pemilik/",
    "/pemilik?x=1",
    "/PEMILIK",
    "/pemilik/stats",
    "/ms/pemilik",
    "/id/pemilik/foo",
    "/api",
    "/api/",
    "/api/owner-stats14",
    "/api/owner/foo",
    "/admin",
    "/admin/login",
    "/login",
    "/login/",
    "/en/login",
  ]) {
    assert.equal(isOwnerAdminPath(p), true, p);
  }
});

test("public catalog paths are not owner/admin exclusions", () => {
  for (const p of [
    "/",
    "/ms",
    "/id",
    "/en",
    "/kategori/bokep",
    "/watch/abc",
    "/cari/bokep-indoav-terbaru",
    "/cari/bokep-indo-stw",
    "/pemilikku",
    "/login-help",
    "/adminish",
    "",
    undefined,
    null,
  ]) {
    assert.equal(isOwnerAdminPath(p as string | undefined | null), false, String(p));
  }
});

test("owner/admin exclusion is not implemented via isAdFreePath", () => {
  assert.equal(isAdFreePath("/pemilik"), false);
  assert.equal(isAdFreePath("/api/owner-stats14"), false);
  assert.equal(isAdFreePath("/login"), false);
  assert.equal(isAdFreePath("/admin"), false);
});
