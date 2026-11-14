import assert from "node:assert/strict";
import test from "node:test";
import {
  KIRIMAN_IP_PER_DAY,
  KIRIMAN_PENDING_CAP,
  decideKiriman,
  classifyUploadResult,
  duplicateKind,
  idsFromCatalogItem,
  inspectPublicBody,
  normalizeVideyUrl,
  sanitizeKirimanTitle,
} from "./kiriman-videy.ts";

const ID = "UQQvGURS1";
const OTHER = "8BmVJ87W1";

test("normalizes videy.co, www, and cdn file links to the Videy id", () => {
  for (const url of [
    `https://videy.co/v?id=${ID}`,
    `https://videy.co/v/?id=${ID}`,
    `http://www.videy.co/v/?id=${ID}`,
    `https://videy.co/v/?foo=1&id=${ID}`,
    `https://cdn.videy.co/${ID}.mp4`,
    `https://cdn.videy.co/${ID}.mp4?download=1`,
    `https://cdn2.videy.co/${ID}.MP4`,
  ]) {
    const norm = normalizeVideyUrl(url);
    assert.ok(norm, url);
    assert.equal(norm.id, ID);
    assert.equal(norm.url, `https://videy.co/v/?id=${ID}`);
  }
  const mov = normalizeVideyUrl("https://cdn.videy.co/UQQvGURS2.mov");
  assert.equal(mov?.id, "UQQvGURS2");
});

test("rejects links that are not a Videy video", () => {
  const bad = [
    "",
    "not a url",
    "https://videyy.icu/watch/UQQvGURS1",
    "https://videy.co.evil.com/v?id=UQQvGURS1",
    "https://evil.com/v?id=UQQvGURS1",
    "https://videy.co/v",
    "https://videy.co/v?id=short",
    "https://videy.co/v?id=UQQvGURS9",
    "https://cdn.videy.co/UQQvGURS1.jpg",
    "https://cdn.videy.co/UQQvGURS1.mp4.exe",
    "javascript:alert(1)",
    "https://user:pass@videy.co/v?id=UQQvGURS1",
    "https://videy.co:8443/v?id=UQQvGURS1",
  ];
  for (const url of bad) assert.equal(normalizeVideyUrl(url), null, url);
});

test("strips HTML and control characters from the title and caps it at 120", () => {
  assert.equal(sanitizeKirimanTitle("  Halo <b>dunia</b>  "), "Halo dunia");
  assert.equal(sanitizeKirimanTitle("<script>alert(1)</script>Judul"), "alert(1)Judul");
  assert.equal(sanitizeKirimanTitle("A\u0000B\nC\tD"), "A B C D");
  assert.equal(sanitizeKirimanTitle(12), "");
  assert.equal(sanitizeKirimanTitle("x".repeat(200)).length, 120);
});

test("honeypot drops before URL checks; a real body is ready", () => {
  assert.deepEqual(inspectPublicBody({ url: "nope", site: "videyy.icu", hp: "bot" }), { kind: "drop" });
  assert.deepEqual(inspectPublicBody({ url: "https://videy.co/v?id=nope", site: "videyy.icu" }), { kind: "invalid" });
  assert.deepEqual(inspectPublicBody({ url: `https://videy.co/v?id=${ID}`, site: "videqsss.icu" }), { kind: "invalid" });
  assert.deepEqual(inspectPublicBody({ url: `https://cdn.videy.co/${ID}.mp4`, title: "<i>Dari</i> penonton", site: "videyy.icu", hp: "" }), {
    kind: "ready",
    id: ID,
    url: `https://videy.co/v/?id=${ID}`,
    title: "Dari penonton",
  });
});

test("duplicate when the id is already in the catalog or the pending queue", () => {
  assert.equal(duplicateKind(ID, [OTHER], []), null);
  assert.equal(duplicateKind(ID, [ID], []), "catalog");
  assert.equal(duplicateKind("uqqvgurs1", ["UQQvGURS1"], []), "catalog");
  assert.equal(duplicateKind(ID, [], [ID]), "pending");
  assert.equal(duplicateKind(ID, [ID], [ID]), "pending");
  assert.deepEqual(idsFromCatalogItem({ id: ID, embed: `https://videy.co/v/?id=${ID}`, direct: `https://cdn.videy.co/${ID}.mp4` }), [ID, ID, ID]);
  assert.deepEqual(idsFromCatalogItem({ id: "not-videy", embed: "https://example.com/e/abc" }), []);
});

test("decideKiriman: duplicate, full queue, and the daily IP cap", () => {
  const base = { id: ID, pendingIds: [] as string[], catalogIds: [] as string[], pendingCount: 0, ipCount: 0 };
  assert.equal(decideKiriman(base), "pending");
  assert.equal(decideKiriman({ ...base, catalogIds: [ID] }), "duplicate");
  assert.equal(decideKiriman({ ...base, pendingIds: [ID] }), "duplicate");
  assert.equal(decideKiriman({ ...base, pendingCount: KIRIMAN_PENDING_CAP }), "rate_limited");
  assert.equal(decideKiriman({ ...base, pendingCount: KIRIMAN_PENDING_CAP - 1 }), "pending");
  assert.equal(decideKiriman({ ...base, ipCount: KIRIMAN_IP_PER_DAY }), "rate_limited");
  assert.equal(decideKiriman({ ...base, ipCount: KIRIMAN_IP_PER_DAY - 1 }), "pending");
  assert.equal(decideKiriman({ ...base, catalogIds: [ID], pendingCount: KIRIMAN_PENDING_CAP, ipCount: KIRIMAN_IP_PER_DAY }), "duplicate");
});

test("upload replies: a zero-created summary is not success", () => {
  assert.equal(classifyUploadResult(["✅ 0 dibuat · ⏭️ 0 skip · ⚠️ 0 gagal · ⛔ 1 ditolak"], 0), "failed");
  assert.equal(classifyUploadResult(["✅ UQQvGURS1 — Judul penonton"], 1), "saved");
  assert.equal(classifyUploadResult(["🕒 UQQvGURS1 — Judul (antre, tayang saat flush berikutnya)"], 0), "saved");
  assert.equal(classifyUploadResult(["⛔ UQQvGURS1: Ditahan, judul perlu diganti."], 0), "saved");
  assert.equal(classifyUploadResult(["⏭️ UQQvGURS1 — Judul (sudah ada)"], 0), "exists");
});
