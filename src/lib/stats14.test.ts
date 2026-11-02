import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStats14, changeWords, classifySource, foldDayRows, foldUtmRows, wibDayList } from "./stats14.ts";

test("classifySource maps real referrers from the site", () => {
  const cases: [string, string][] = [
    ["(direct)", "direct"],
    ["", "direct"],
    ["koleksidrpinguin.com", "internal"],
    ["koleksidrpinguin.com.", "internal"],
    ["koleksidrpinguin.site", "internal"],
    ["google.com", "google"],
    ["google.co.id", "google"],
    ["cse.google.com", "google"],
    ["com.google.android.googlequicksearchbox", "google"],
    ["bing.com", "bing"],
    ["www2.bing.com", "bing"],
    ["duckduckgo.com", "duckduckgo"],
    ["html.duckduckgo.com", "duckduckgo"],
    ["search.yahoo.com", "yahoo"],
    ["id.search.yahoo.com", "yahoo"],
    ["justpaste.it", "justpaste"],
    ["t.me", "telegram"],
    ["org.telegram.messenger", "telegram"],
    ["search.brave.com", "other"],
    ["t.co", "other"],
    ["notgoogle.example", "other"],
  ];
  for (const [ref, want] of cases) assert.equal(classifySource(ref), want, ref);
});

test("foldDayRows counts views and distinct visitors per key", () => {
  const rows = foldDayRows("2026-11-02", [
    { device: "mobile", ref: "duckduckgo.com", country: "ID", browser: "chrome", visitor: "a", vw: 1, n: 1 },
    { device: "mobile", ref: "koleksidrpinguin.com", country: "ID", browser: "chrome", visitor: "a", vw: 1, n: 5 },
    { device: "desktop", ref: "(direct)", country: "SG", browser: "firefox", visitor: "b", vw: 1, n: 2 },
    { device: "mobile", ref: "search.brave.com", country: "ID", browser: "chrome", visitor: "c", vw: 2, n: 1 },
  ]);
  const get = (kind: string, key: string) => rows.find((r) => r.kind === kind && r.key === key);
  assert.deepEqual(
    { v: get("device", "mobile")?.views, u: get("device", "mobile")?.uniq },
    { v: 8, u: 3 }, // a: 6 views, c: 1 view × weight 2; uniq a=1 + c=2
  );
  assert.equal(get("src", "internal")?.views, 5);
  assert.equal(get("src", "duckduckgo")?.uniq, 1);
  assert.equal(get("src", "other")?.uniq, 2);
  assert.equal(get("ref", "search.brave.com")?.uniq, 2);
  assert.equal(get("ref", "duckduckgo.com"), undefined);
  assert.equal(get("country", "ID")?.uniq, 3);
});

test("buildStats14 splits 14 shown days from the 14 before", () => {
  const today = "2026-11-02";
  const all = wibDayList(today, 28);
  assert.equal(all[0], "2026-10-06");
  assert.equal(all[27], today);
  const rows = all.flatMap((day, i) => [
    { day, kind: "device" as const, key: "mobile", views: 10, uniq: i < 14 ? 1 : 2 },
    { day, kind: "src" as const, key: "google", views: 3, uniq: 1 },
    { day, kind: "src" as const, key: "internal", views: 7, uniq: 1 },
    { day, kind: "path" as const, key: "/watch/x", views: 4, uniq: 1 },
  ]);
  const totals = all.map((day) => ({ day, views: 10, uniq: 2 }));
  const s = buildStats14(today, rows, totals, Date.parse("2026-11-02T16:00:00Z"));
  assert.equal(s.days.length, 14);
  assert.equal(s.days[0], "2026-10-20");
  assert.equal(s.totals.uniq, 28);
  assert.equal(s.totals.prevUniq, 28);
  const hp = s.devices.find((d) => d.key === "mobile");
  assert.equal(hp?.total, 28);
  assert.equal(hp?.prevTotal, 14);
  assert.equal(s.sources.find((x) => x.key === "google")?.total, 14);
  assert.equal(s.internalViews.reduce((a, b) => a + b, 0), 98);
  assert.deepEqual(s.pages[0], { key: "/watch/x", label: "/watch/x", views: 56, uniq: 14 });
});

test("changeWords is plain words, no percentages", () => {
  const f = (n: number) => n.toLocaleString("id-ID");
  assert.equal(changeWords(3417, 3000, f), "naik 417 dari 14 hari sebelumnya (3.000)");
  assert.equal(changeWords(1000, 2500, f), "turun 1.500 dari 14 hari sebelumnya (2.500)");
  assert.equal(changeWords(5, 5, f), "sama dengan 14 hari sebelumnya");
  assert.doesNotMatch(changeWords(1, 2, f), /%/);
});

test("foldUtmRows + buildStats14 give the Kampanye (UTM) list", () => {
  const today = "2026-11-02";
  const rows = foldUtmRows(today, [
    { utm: "justpaste|paste|organic|", visitor: "a", vw: 1, n: 1 },
    { utm: "justpaste|paste|organic|", visitor: "b", vw: 2, n: 1 },
    { utm: "telegram|channel|organic|", visitor: "c", vw: 1, n: 2 },
    { utm: "|bad||", visitor: "d", vw: 1, n: 1 },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.key, r.views, r.uniq]),
    [
      ["utm", "justpaste|paste|organic|", 3, 3],
      ["utm", "telegram|channel|organic|", 2, 1],
    ],
  );
  const s = buildStats14(today, rows, [], 0);
  assert.equal(s.campaigns[0].label, "justpaste / paste · organic");
  assert.equal(s.campaigns[0].uniq, 3);
  assert.equal(s.campaigns.length, 2);
});
