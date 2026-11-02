import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PER_DAY, PROFILE_BIO, PROFILE_NAME, baseTitle, blockReason, buildPost, englishBlockReason, englishTitle, pickNext,
  postsLast24h, profilePatch, watchUrl,
} from "./lib/bluesky-post-lib.mjs";
import { fallbackTitle, toEnglishTitle } from "./lib/bluesky-english.mjs";

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

test("toEnglishTitle: deterministic word map, unknown words dropped, generic fallback", () => {
  assert.equal(toEnglishTitle("Cici Cantik Jago Nyepong Hyper Pengen Ngentot Terus").title, "Babe pretty blowjob horny sex");
  assert.equal(toEnglishTitle("tobrut gemoy kena GB pria bertato").title, "Busty chubby gangbang guy tattooed");
  const fb = toEnglishTitle("Berkata Kali Ini Sangat Enak", "abc");
  assert.equal(fb.fallback, true);
  assert.equal(fb.title, fallbackTitle("abc"));
  assert.equal(toEnglishTitle("Berkata Kali Ini Sangat Enak", "abc").title, fb.title);
  // Words outside the map never reach the post.
  assert.ok(!/xyzname/i.test(toEnglishTitle("Tobrut xyzname montok ngentot hotel").title));
});

test("englishBlockReason applies the same rules to the English text", () => {
  for (const t of ["Leaked tape", "Hidden camera", "Teen babe", "Young wife", "Stepmom", "Drunk girl", "Forced", "School uniform", "AI babe", "19 yo"])
    assert.notEqual(englishBlockReason(t), "", t);
  assert.equal(englishBlockReason("Busty chubby gangbang guy tattooed"), "");
  // English titles that would only be blocked in English are skipped by pickNext too.
  const live = new Set(["e1"]);
  const r = pickNext([ok({ id: "e1", title: "Petite teen babe hotel" })], live, { posted: [] }, NOW);
  assert.equal(r.item, null);
});

test("buildPost: English text, UTM link facet, brand-image card, adult self-label", () => {
  const thumb = { $type: "blob", ref: { $link: "bafk" }, mimeType: "image/jpeg", size: 68681 };
  const rec = buildPost(ok({ id: "Ab_1", title: "Tobrut montok ngentot di hotel - koleksidrpinguin.com" }), new Date(NOW), thumb);
  assert.equal(rec.text, "Busty curvy sex hotel\n🔞 18+ · Watch: koleksidrpinguin.com/watch/Ab_1");
  assert.deepEqual(rec.langs, ["en"]);
  assert.deepEqual(rec.embed.external.thumb, thumb);
  assert.equal(englishTitle(ok({ title: "pamer body" })), "Showing off body");
  assert.equal(buildPost(ok()).embed.external.thumb, undefined);
});

test("buildPost: UTM link facet with byte offsets, adult self-label", () => {
  const rec = buildPost(ok({ id: "Ab_1" }), new Date(NOW));
  const url = watchUrl("Ab_1");
  assert.equal(url, "https://koleksidrpinguin.com/watch/Ab_1?utm_source=bluesky&utm_medium=social&utm_campaign=organic&utm_content=Ab_1");
  const bytes = new TextEncoder().encode(rec.text);
  const { byteStart, byteEnd } = rec.facets[0].index;
  assert.equal(new TextDecoder().decode(bytes.slice(byteStart, byteEnd)), "koleksidrpinguin.com/watch/Ab_1");
  assert.equal(rec.facets[0].features[0].uri, url);
  assert.equal(rec.embed.external.uri, url);
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
  // Bio text changed: overwrite the old (Indonesian) bio, keep everything else.
  const old = { displayName: "Koleksi Dr. Pinguin", description: "Koleksi video dewasa Indonesia", labels: { values: [{ val: "bot" }] } };
  const upd = profilePatch(old, { forceBio: true });
  assert.equal(upd.description, PROFILE_BIO);
  assert.deepEqual(upd.labels, old.labels);
  assert.equal(profilePatch({ ...old, description: PROFILE_BIO }, { forceBio: true }), null);
  assert.equal(PROFILE_BIO, "Hot adult videos, updated daily. 🔞 18+ only, leave if you are under 18. https://koleksidrpinguin.com");
});
