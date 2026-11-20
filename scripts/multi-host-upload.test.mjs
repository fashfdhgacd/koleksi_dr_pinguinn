// Regression: one multi-server upload (every known host) must keep every host, end to end:
// parse (Telegram / /pemilik paste) -> record ids/hosts -> merge into ONE watch page.
// 2026-11-16..20: Lulu share links moved to lplaygo.com (stored as generic embeds, Lulu server gone) and
// Dood/Byse titles "… com" split the page in two. Any change that drops a host fails here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMessage } from "../src/lib/bot/parse.js";
import { brandUploadTitle, cleanUploadTitle } from "../src/lib/bot/title-brand.js";
import { drpKindOfUrl, LULU_EMBED_HOST } from "../src/lib/catalog/drp-hosts.js";
import { mergeServers, serverHostOf } from "../src/lib/catalog/multi-server.ts";
import { coverageLines, reconcileLine, uploadCoverage } from "../src/lib/bot/upload-coverage.js";
import { hostAlerts, summarize } from "./lib/host-health-lib.mjs";

const LINKS = {
  lulu: "https://lplaygo.com/8kalvawl2ar2",
  luluOld: "https://luluvdo.com/e/8kalvawl2ar2",
  luluBrand: "https://lulustream.com/e/8kalvawl2ar2",
  dood: "https://playmogo.com/e/njrbywt0f4jg",
  byse: "https://bysejikuar.com/e/3zo0v0tajpdw",
  mxdrop: "https://mxdrop.sx/e/pjjn9n0jiq6okl",
  vidara: "https://vidara.to/e/mNKCLNJMZOT6e",
  streamtape: "https://streamtape.com/e/jWg4jkWLLjtzAar",
};

test("every known host link parses to its own server (no generic embed)", () => {
  const msg = parseMessage(Object.values(LINKS).map((u) => `${u} The Silence of the Lambs Episode 9`).join("\n"));
  const hosts = msg.videos.map((v) => v.host);
  for (const h of ["lulu", "dood", "byse", "mxdrop", "vidara", "streamtape"]) assert.ok(hosts.includes(h), `missing ${h}: ${hosts}`);
  assert.ok(!hosts.includes("embed"), `generic embed in ${hosts}`);
  // All Lulu domains (old, brand, current mirror) -> one lu-<code> on the current embed host.
  const lulu = msg.videos.filter((v) => v.host === "lulu");
  assert.equal(new Set(lulu.map((v) => v.id)).size, 1);
  assert.equal(lulu[0].embed, `https://${LULU_EMBED_HOST}/e/8kalvawl2ar2`);
  assert.equal(drpKindOfUrl("https://lplaygo.com/e/abc123def"), "lulu");
  assert.deepEqual(uploadCoverage(msg).generic, {});
  assert.deepEqual(uploadCoverage(msg).unparsed, {});
});

test("host file-name titles ('koleksidrpinguin com') clean to the same title", () => {
  assert.equal(cleanUploadTitle("The Silence of the Lambs Episode 9 - koleksidrpinguin com"), "The Silence of the Lambs Episode 9");
  assert.equal(cleanUploadTitle("The Silence of the Lambs Episode 9 koleksidrpinguin.com"), "The Silence of the Lambs Episode 9");
});

test("one upload over every host merges into one watch page with every server", () => {
  const titles = {
    lulu: "The Silence of the Lambs Episode 9 - koleksidrpinguin.com",
    dood: "The Silence of the Lambs Episode 9 com - koleksidrpinguin.com",
    byse: "The Silence Of The Lambs Episode 9 Com - koleksidrpinguin.com",
    mxdrop: "The Silence of the Lambs Episode 9 - koleksidrpinguin.com",
    vidara: brandUploadTitle("The Silence of the Lambs Episode 9"),
    streamtape: "The Silence of the Lambs Episode 9 - koleksidrpinguin.com",
  };
  const src = { lulu: "LuluStream", dood: "DoodStream", byse: "Byse", mxdrop: "MXDrop", vidara: "Vidara", streamtape: "Streamtape" };
  const items = Object.entries(titles).map(([k, title], i) => ({
    id: `${k}-1`,
    title,
    embed: LINKS[k],
    source: src[k],
    date: "2026-11-18",
    createdAt: i + 1,
  }));
  const { groups } = mergeServers(items);
  assert.equal(groups.length, 1, JSON.stringify(groups));
  const ids = groups[0].ids || groups[0].servers?.map((s) => s.id);
  assert.equal(ids.length, 6);
  const hosts = new Set(items.map((it) => serverHostOf(it)));
  assert.equal(hosts.size, 6);
});

test("bot reply shouts about unknown mirror domains and unparsed links", () => {
  const msg = parseMessage(["https://playmogo.com/e/njrbywt0f4jg judul", "https://newmirror.example/abc123xyz"].join("\n"));
  const lines = coverageLines(msg).join("\n");
  assert.match(lines, /Domain belum dikenal sebagai server: newmirror\.example 1/);
  assert.equal(reconcileLine(5, { created: 3, skipped: 1 }).startsWith("🚨 1 dari 5"), true);
  assert.equal(reconcileLine(5, { created: 3, skipped: 1, failed: 1 }), "");
});

test("daily host check flags a host that stops getting uploads, drops, or a dead domain", () => {
  const rows = [];
  for (let i = 0; i < 30; i++) {
    rows.push({ id: `dd-${i}`, source: "DoodStream", embed: "https://playmogo.com/e/x", date: "2026-11-19" });
    rows.push({ id: `by-${i}`, source: "Byse", embed: "https://bysejikuar.com/e/x", date: "2026-11-19" });
    rows.push({ id: `lu-${i}`, source: "LuluStream", embed: "https://luluvdo.com/e/x", date: "2026-11-10" });
  }
  const sum = summarize(rows, "2026-11-20");
  const alerts = hostAlerts(sum, { LuluStream: 30, Streamtape: 100 }, [{ family: "LuluStream", host: "luluvdo.com", error: "ENOTFOUND" }]);
  const text = alerts.join("\n");
  assert.match(text, /LuluStream: 0 upload baru/);
  assert.match(text, /Streamtape: 100 → 0/);
  assert.match(text, /Domain embed mati: luluvdo\.com/);
  assert.deepEqual(hostAlerts(sum, { DoodStream: 30, Byse: 30, LuluStream: 30 }, []).filter((a) => !/upload baru/.test(a)), []);
});
