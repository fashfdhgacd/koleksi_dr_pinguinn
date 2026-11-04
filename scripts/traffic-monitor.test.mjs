import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mergeDays,
  detectDrop,
  wibDay,
  wibDayStartMs,
  sourceSql,
  idSourceSql,
  summarySql,
  main,
} from "./traffic-monitor.mjs";

test("hari WIB: 17:30 UTC = hari berikutnya di WIB", () => {
  assert.equal(wibDay(Date.parse("2026-11-01T17:30:00Z")), "2026-11-02");
  assert.equal(wibDay(Date.parse("2026-11-01T16:59:59Z")), "2026-11-01");
  assert.equal(wibDayStartMs("2026-11-02"), Date.parse("2026-11-01T17:00:00Z"));
});

test("SQL cuma SELECT/with dan menolak input aneh", () => {
  assert.match(sourceSql(1792429200000), /^with f as \(select/);
  assert.doesNotMatch(sourceSql(1) + summarySql("2026-11-01"), /\b(insert|update|delete|drop)\b/i);
  assert.throws(() => summarySql("2026-11-01'; drop table x"));
  assert.throws(() => sourceSql("abc"));
});

test("idSourceSql: SELECT saja dan mengisi sources_id", () => {
  assert.match(idSourceSql(1792429200000), /c='ID'/);
  assert.doesNotMatch(idSourceSql(1), /\b(insert|update|delete|drop)\b/i);
  const out = mergeDays({}, { sources: [{ d: "2026-11-01", src: "bing", v: 3 }], idSources: [{ d: "2026-11-01", src: "bing", v: 2 }] }, "2026-11-05");
  assert.equal(out["2026-11-01"].sources_id.bing, 2);
});

test("mergeDays menimpa hari yang dihitung ulang, hari lama tetap", () => {
  const old = {
    "2026-10-30": { sources: { google: 5 }, landing_visitors: 5 },
    "2026-11-01": { sources: { bing: 1 } },
  };
  const out = mergeDays(
    old,
    {
      sources: [
        { d: "2026-11-01", src: "google", v: 10 },
        { d: "2026-11-01", src: "direct", v: 3 },
        { d: "2026-11-02", src: "google", v: 2 },
      ],
      summary: [{ d: "2026-11-01", views: 99, unique_visitors: 12 }],
      newReturning: [{ d: "2026-11-01", new_v: 9, ret_v: 3 }],
    },
    "2026-11-02",
  );
  assert.deepEqual(out["2026-10-30"], old["2026-10-30"]);
  assert.deepEqual(out["2026-11-01"], {
    sources: { google: 10, direct: 3 },
    unique_visitors: 12,
    pageviews: 99,
    new: 9,
    returning: 3,
    landing_visitors: 13,
  });
  assert.equal(out["2026-11-02"].partial, true);
  assert.deepEqual(Object.keys(out), ["2026-10-30", "2026-11-01", "2026-11-02"]);
});

test("detectDrop: abaikan internal & hari parsial, alert kalau turun >=40%", () => {
  const days = {};
  for (let i = 1; i <= 7; i++) days[`2026-10-2${i}`] = { sources: { bing: 100, internal: 500 } };
  days["2026-10-28"] = { sources: { bing: 50, internal: 5000 } };
  days["2026-10-29"] = { sources: { bing: 1 }, partial: true };
  const r = detectDrop(days, "2026-10-29");
  assert.equal(r.day, "2026-10-28");
  assert.equal(r.avg7, 100);
  assert.equal(r.alert, true);
  assert.deepEqual(r.perSource.bing, { last: 50, avg7: 100 });
  assert.equal(detectDrop({ "2026-10-01": { sources: {} } }, "2026-10-02"), null);
});

test("file data valid & tanpa secret tidak menulis apa-apa", async () => {
  const doc = JSON.parse(readFileSync("data/traffic-daily.json", "utf8"));
  assert.ok(doc.days["2026-10-20"].sources.duckduckgo > 0);
  for (const [d, x] of Object.entries(doc.days)) {
    assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(
      x.landing_visitors,
      Object.values(x.sources).reduce((a, b) => a + b, 0),
    );
  }
  const r = await main({}, Date.parse("2026-11-02T15:00:00Z"));
  assert.equal(r.mode, "file-only");
  assert.equal(
    readFileSync("data/traffic-daily.json", "utf8"),
    JSON.stringify(doc, null, 2) + "\n",
  );
});
