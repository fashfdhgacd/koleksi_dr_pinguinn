import test from "node:test";
import assert from "node:assert/strict";
import { parseIndexNowState, planIndexNowSync, prioritizeIndexNow } from "./lib/indexnow-sync-lib.mjs";

test("state parsing normalizes CRLF so unchanged URLs do not look changed", () => {
  assert.deepEqual(
    [...parseIndexNowState("/ 2026-11-03\r\n/kategori -\r\n")],
    [
      ["/", "2026-11-03"],
      ["/kategori", "-"],
    ],
  );
});

test("removed URLs beyond the per-run cap remain queued for later runs", () => {
  const previous = new Map(Array.from({ length: 4505 }, (_, i) => [`/watch/${i}`, "2026-11-01"]));
  const live = new Map([["/", "2026-11-02"]]);

  const first = planIndexNowSync(live, previous, { maxRemoved: 2000 });
  assert.equal(first.send.length, 2001);
  assert.equal(first.next.size, 2506);
  assert.equal(first.next.has("/watch/2000"), true);

  const second = planIndexNowSync(live, first.next, { maxRemoved: 2000 });
  assert.equal(second.send.length, 2000);
  assert.equal(second.next.size, 506);

  const third = planIndexNowSync(live, second.next, { maxRemoved: 2000 });
  assert.equal(third.send.length, 505);
  assert.deepEqual([...third.next], [["/", "2026-11-02"]]);
});

test("changed live URLs are sent once and removed URLs are deduplicated", () => {
  const previous = new Map([
    ["/", "2026-11-01"],
    ["/watch/a", "2026-11-01"],
    ["/watch/gone", "2026-11-01"],
  ]);
  const live = new Map([
    ["/", "2026-11-02"],
    ["/watch/a", "2026-11-01"],
  ]);

  const plan = planIndexNowSync(live, previous, { maxRemoved: 2 });
  assert.deepEqual(plan.send, ["/", "/watch/gone"]);
  assert.deepEqual([...plan.next], [...live]);
});

test("a missing prior state seeds state without submitting unless --all is requested", () => {
  const live = new Map([["/", "-"]]);
  assert.deepEqual(planIndexNowSync(live, null), { send: [], next: live });
  assert.deepEqual(planIndexNowSync(live, null, { all: true }), { send: ["/"], next: live });
});

test("--all still preserves removed URLs beyond the deletion cap", () => {
  const previous = new Map(Array.from({ length: 2501 }, (_, i) => [`/watch/${i}`, "-"]));
  const live = new Map([["/", "-"]]);

  const plan = planIndexNowSync(live, previous, { all: true, maxRemoved: 2000 });
  assert.equal(plan.send.length, 2001);
  assert.equal(plan.next.size, 502);
  assert.equal(plan.next.has("/watch/2000"), true);
});

test("prioritizeIndexNow sends brand-new /watch pages first", () => {
  const prev = new Map([["/watch/old", "a"], ["/kategori/x", "a"]]);
  const out = prioritizeIndexNow(["/kategori/x", "/halaman/9", "/watch/old", "/watch/new1", "/watch/new2"], prev);
  assert.deepEqual(out, ["/watch/new1", "/watch/new2", "/halaman/9", "/kategori/x", "/watch/old"]);
});

import { parseIndexNowOriginState, formatIndexNowState, seedIndexNowPaths } from "./lib/indexnow-sync-lib.mjs";

test("parseIndexNowState ignores absolute satellite URLs", () => {
  const mixed = "/ 2026-11-03\nhttps://videyy.icu/watch/a 2026-11-04\n";
  assert.deepEqual([...parseIndexNowState(mixed)], [["/", "2026-11-03"]]);
});

test("parseIndexNowOriginState reads only that host's absolute URLs", () => {
  const mixed = [
    "/ 2026-11-03",
    "https://videyy.icu/ 2026-11-04",
    "https://videyy.icu/watch/a 2026-11-05",
    "https://videqsss.icu/watch/a 2026-11-06",
    "",
  ].join("\n");
  assert.deepEqual(
    [...parseIndexNowOriginState(mixed, "https://videyy.icu")],
    [
      ["/", "2026-11-04"],
      ["/watch/a", "2026-11-05"],
    ],
  );
  assert.deepEqual([...parseIndexNowOriginState(mixed, "https://videqsss.icu")], [["/watch/a", "2026-11-06"]]);
});

test("formatIndexNowState writes /path lines or absolute URLs", () => {
  const map = new Map([
    ["/", "2026-11-03"],
    ["/watch/a", "2026-11-04"],
  ]);
  assert.equal(formatIndexNowState(map), "/ 2026-11-03\n/watch/a 2026-11-04");
  assert.equal(
    formatIndexNowState(map, "https://videyy.icu"),
    "https://videyy.icu/ 2026-11-03\nhttps://videyy.icu/watch/a 2026-11-04",
  );
});

test("seedIndexNowPaths puts sitemap and home first, then newest watch pages", () => {
  const live = new Map([
    ["/", "2026-11-01"],
    ["/kategori/x", "2026-11-01"],
    ["/watch/old", "2026-11-01"],
    ["/watch/new", "2026-11-10"],
  ]);
  assert.deepEqual(seedIndexNowPaths(live, { max: 3 }), ["/sitemap.xml", "/", "/watch/new"]);
  assert.equal(seedIndexNowPaths(live, { max: 10 }).length, 5);
});
