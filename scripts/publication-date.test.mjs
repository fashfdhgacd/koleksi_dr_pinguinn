import assert from "node:assert/strict";
import test from "node:test";
import { publicationDate } from "../src/lib/catalog/publication-date.js";

test("publication metadata preserves the catalog day and equivalent timestamps", () => {
  const now = Date.parse("2026-11-24T14:00:00Z");
  const iso = "2026-10-20T00:00:00Z";
  for (const value of ["2026-10-20", "2026-10-20T07:00:00+07:00", Date.parse(iso), String(Date.parse(iso) / 1000)]) {
    assert.equal(publicationDate(value, now), iso);
  }
  for (const value of [null, "", "invalid", "2026-02-30", "2026-12-01", 0, NaN]) {
    assert.equal(publicationDate(value, now), undefined);
  }
});
