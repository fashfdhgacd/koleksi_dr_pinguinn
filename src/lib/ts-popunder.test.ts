import { test } from "node:test";
import assert from "node:assert/strict";
import { tsPopunderSummary, tsDayWindowWib, utcDate } from "./ts-popunder.ts";

const data = {
  updatedAt: "2026-11-02T13:00:58Z",
  days: [{ date: "2026-11-02", impressions: 4423, earnings: 1.11 }],
  spots: [
    { date: "2026-11-01", spots: [{ id: "5210859", impressions: 12571, earnings: 2.71 }, { id: "5210886", impressions: 334, earnings: 0.02 }] },
    { date: "2026-11-02", spots: [{ id: "5210859", impressions: 4311, earnings: 1.11 }, { id: "5210886", impressions: 112, earnings: 0.01 }] },
  ],
};

test("uses the popunder spot only, not the all-spot day total", () => {
  // 22:30 WIB on 2 Nov = 15:30 UTC on 2 Nov -> TrafficStars day 2026-11-02
  const s = tsPopunderSummary(data, Date.parse("2026-11-02T15:30:00Z"));
  assert.deepEqual(s.today, { date: "2026-11-02", impressions: 4311, earnings: 1.11 });
  assert.deepEqual(s.yesterday, { date: "2026-11-01", impressions: 12571, earnings: 2.71 });
  assert.equal(s.updatedAt, "2026-11-02T13:00:58Z");
});

test("between 00:00 and 07:00 WIB the TrafficStars day is still the previous date", () => {
  // 03:00 WIB on 3 Nov = 20:00 UTC on 2 Nov
  assert.equal(utcDate(Date.parse("2026-11-02T20:00:00Z")), "2026-11-02");
  // 08:00 WIB on 3 Nov = 01:00 UTC on 3 Nov: new day, no row synced yet
  const s = tsPopunderSummary(data, Date.parse("2026-11-03T01:00:00Z"));
  assert.equal(s.today, null);
  assert.equal(s.yesterday?.impressions, 4311);
});

test("missing data", () => {
  assert.deepEqual(tsPopunderSummary(null), { today: null, yesterday: null, updatedAt: null });
});

test("day window is labelled in WIB starting 07.00", () => {
  const w = tsDayWindowWib("2026-11-02");
  assert.match(w, /2 Nov.*07[.:]00.*3 Nov.*07[.:]00 WIB/);
});
