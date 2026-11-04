import test from "node:test";
import assert from "node:assert/strict";
import { significantLastmod, STATIC_PAGE_LASTMOD } from "../src/lib/catalog/lastmod.js";

const NOW = Date.parse("2026-11-05T00:00:00Z");

test("upload date alone gives upload day", () => {
  assert.equal(significantLastmod("2026-10-01T10:00:00Z", undefined, NOW), "2026-10-01");
});

test("later owner edit moves lastmod", () => {
  assert.equal(significantLastmod("2026-10-01", Date.parse("2026-10-20T05:00:00Z"), NOW), "2026-10-20");
});

test("older edit does not move lastmod back", () => {
  assert.equal(significantLastmod("2026-10-25", Date.parse("2026-10-20T05:00:00Z"), NOW), "2026-10-25");
});

test("future dates are ignored, never emitted", () => {
  assert.equal(significantLastmod("2027-01-01", undefined, NOW), undefined);
  assert.equal(significantLastmod("2026-10-01", Date.parse("2027-01-01"), NOW), "2026-10-01");
});

test("epoch seconds and garbage", () => {
  assert.equal(significantLastmod(Date.parse("2026-09-09T00:00:00Z") / 1000, undefined, NOW), "2026-09-09");
  assert.equal(significantLastmod("nope", undefined, NOW), undefined);
});

test("static page dates are valid and not in the future", () => {
  for (const d of Object.values(STATIC_PAGE_LASTMOD)) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});
