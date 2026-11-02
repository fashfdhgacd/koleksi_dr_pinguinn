import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PER_DAY, PROFILE_BIO, PROFILE_NAME, baseTitle, blockReason, buildPost, pickNext, postsLast24h, profilePatch, watchUrl,
} from "./lib/bluesky-post-lib.mjs";

const NOW = Date.parse("2026-11-03T05:00:00Z");
const ok = (over = {}) => ({ id: "abc123", title: "Cici Cantik Jago Nyepong - koleksidrpinguin.com", category: "lainnya", date: "2026-11-03", ...over });

test("baseTitle strips brand suffix and leading punctuation", () => {
  assert.equal(baseTitle("! Dokter kandungan pria - koleksidrpinguin.com"), "Dokter kandungan pria");
});

test("blockReason passes a clean title and blocks unsafe ones", () => {
  assert.equal(blockReason(ok()), "");
  for (const t of [
    "Video bocor pasangan", "kesebar di grup", "direkam diam diam", "hidden cam kamar", "Cewek SMA pulang",
    "seragam olahraga", "Ayah dan anak", "Tiktokers tobrut", "T1KTOK seleb", "ABG 18 tahun", "Hijab viral",
    "Mahasiswi kampus", "Haremku di Benua Douluo", "Episode 3 dari Sang Guru", "Sophie Rain (Dibuat Oleh AI)",
    "Felicia Sextape", "digilir teman", "dipaksa pulang", "Menyelinap Masuk pada Larut Malam",
  ]) assert.notEqual(blockReason(ok({ title: t })), "", t);
  assert.notEqual(blockReason(ok({ hidden: true })), "");
  assert.notEqual(blockReason(ok({ title_hold: "x" })), "");
  assert.notEqual(blockReason(ok({ category: "amatir" })), "");
  assert.notEqual(blockReason(ok({ category: "ai-plus" })), "");
});

test("pickNext: newest eligible, live in sitemap, not posted, recent only", () => {
  const items = [
    ok({ id: "new1", title: "Video bocor", date: "2026-11-03" }),
    ok({ id: "notlive", date: "2026-11-03" }),
    ok({ id: "done", date: "2026-11-03", title: "pamer body" }),
    ok({ id: "dupe", date: "2026-11-02", title: "! pamer body - koleksidrpinguin.com" }),
    ok({ id: "good", date: "2026-11-02", title: "Dokter kandungan pria" }),
    ok({ id: "old", date: "2026-10-01", title: "Threesome hotel" }),
  ];
  const live = new Set(["new1", "done", "dupe", "good", "old"]);
  const state = { posted: [{ id: "done", title: "pamer body", at: "2026-11-03T01:00:00Z" }] };
  const { item, skipped } = pickNext(items, live, state, NOW);
  assert.equal(item.id, "good");
  assert.ok(skipped.some(([id]) => id === "notlive"));
  assert.ok(skipped.some(([id]) => id === "new1"));
  assert.equal(pickNext([items[5]], live, { posted: [] }, NOW).item, null);
});

test("postsLast24h counts the daily cap", () => {
  const at = (h) => new Date(NOW - h * 3600_000).toISOString();
  const state = { posted: [at(1), at(5), at(23), at(25), at(48)].map((a, i) => ({ id: `x${i}`, at: a })) };
  assert.equal(postsLast24h(state, NOW), 3);
  assert.equal(MAX_PER_DAY, 6);
});

test("buildPost: UTM link facet with byte offsets, card without image, adult self-label", () => {
  const rec = buildPost(ok({ id: "Ab_1" }), new Date(NOW));
  const url = watchUrl("Ab_1");
  assert.equal(url, "https://koleksidrpinguin.com/watch/Ab_1?utm_source=bluesky&utm_medium=social&utm_campaign=organic&utm_content=Ab_1");
  const bytes = new TextEncoder().encode(rec.text);
  const { byteStart, byteEnd } = rec.facets[0].index;
  assert.equal(new TextDecoder().decode(bytes.slice(byteStart, byteEnd)), "koleksidrpinguin.com/watch/Ab_1");
  assert.equal(rec.facets[0].features[0].uri, url);
  assert.equal(rec.embed.external.uri, url);
  assert.equal(rec.embed.external.thumb, undefined);
  assert.deepEqual(rec.labels.values, [{ val: "porn" }]);
  assert.ok(rec.text.includes("18+"));
  assert.ok([...rec.text].length <= 300);
  const long = buildPost(ok({ title: "kata ".repeat(120) }), new Date(NOW));
  assert.ok([...long.text].length <= 300);
});

test("profilePatch fills only empty fields", () => {
  const p = profilePatch(null);
  assert.equal(p.displayName, PROFILE_NAME);
  assert.equal(p.description, PROFILE_BIO);
  assert.ok([...PROFILE_BIO].length <= 256);
  assert.match(PROFILE_BIO, /18/);
  const kept = profilePatch({ displayName: "Nama Lama", description: "", avatar: { x: 1 } });
  assert.equal(kept.displayName, "Nama Lama");
  assert.deepEqual(kept.avatar, { x: 1 });
  assert.equal(profilePatch({ displayName: "a", description: "b", labels: { values: [{ val: "porn" }] } }), null);
});
