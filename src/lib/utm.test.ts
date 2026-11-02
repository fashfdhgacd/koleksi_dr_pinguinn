import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUtmKey, parseUtm, utmLabel } from "./utm.ts";

test("parseUtm reads the four utm params from a landing query", () => {
  assert.equal(parseUtm("?utm_source=justpaste&utm_medium=paste&utm_campaign=organic"), "justpaste|paste|organic|");
  assert.equal(parseUtm("?page=2&UTM_Source=Telegram&utm_content=Post 12"), "telegram|||post-12");
  assert.equal(parseUtm("https://koleksidrpinguin.com/?utm_campaign=x"), "||x|");
});

test("parseUtm ignores URLs without source/campaign and strips odd characters", () => {
  assert.equal(parseUtm(""), null);
  assert.equal(parseUtm("?page=2"), null);
  assert.equal(parseUtm("?utm_medium=paste"), null);
  assert.equal(parseUtm("?utm_source=<script>alert(1)</script>"), "scriptalert1script|||");
  assert.equal(parseUtm(`?utm_source=${"a".repeat(100)}`), `${"a".repeat(40)}|||`);
});

test("normalizeUtmKey re-validates stored keys", () => {
  assert.equal(normalizeUtmKey("justpaste|paste|organic|"), "justpaste|paste|organic|");
  assert.equal(normalizeUtmKey("JP"), "jp|||");
  assert.equal(normalizeUtmKey("|paste||"), null);
  assert.equal(normalizeUtmKey(5), null);
});

test("utmLabel is readable", () => {
  assert.equal(utmLabel("justpaste|paste|organic|"), "justpaste / paste · organic");
  assert.equal(utmLabel("telegram|||post-12"), "telegram / - · post-12");
});
