import assert from "node:assert/strict";
import test from "node:test";
import { jakartaDay, nextPagePop, pagePopAllowed, PAGE_POP_MAX_PER_DAY } from "./page-pop-cap.ts";

const WIB = 7 * 60 * 60 * 1000;

test("Jakarta day flips at local midnight, not UTC midnight", () => {
  const late = Date.parse("2026-11-05T16:30:00Z"); // 23:30 WIB
  const early = Date.parse("2026-11-05T17:30:00Z"); // 00:30 WIB next day
  assert.equal(jakartaDay(late), "2026-11-05");
  assert.equal(jakartaDay(early), "2026-11-06");
  assert.equal(jakartaDay(Date.parse("2026-11-05T17:00:00Z") - 1), "2026-11-05");
  assert.equal(jakartaDay(Date.parse("2026-11-05T17:00:00Z")), "2026-11-06");
  assert.equal(late + WIB, Date.parse("2026-11-05T23:30:00Z"));
});

test("page popunder allows 3 opens per Jakarta day across pages, then resets", () => {
  const day = Date.parse("2026-11-05T10:00:00Z");
  let state = null as ReturnType<typeof nextPagePop> | null;
  for (let i = 0; i < PAGE_POP_MAX_PER_DAY; i++) {
    assert.equal(pagePopAllowed(state, day), true, `open ${i + 1}`);
    state = nextPagePop(state, day);
  }
  assert.equal(state?.n, 3);
  assert.equal(pagePopAllowed(state, day), false);
  const nextMorning = Date.parse("2026-11-05T18:00:00Z");
  assert.equal(pagePopAllowed(state, nextMorning), true);
  assert.equal(nextPagePop(state, nextMorning).n, 1);
  assert.equal(nextPagePop(state, nextMorning).day, "2026-11-06");
});
