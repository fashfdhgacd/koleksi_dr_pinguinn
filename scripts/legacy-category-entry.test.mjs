import assert from "node:assert/strict";
import test from "node:test";
import middleware from "../server/middleware/halaman.ts";

function visit(path, cookie = "", method = "GET") {
  return middleware({ url: new URL(path, "https://example.com"), req: { method, headers: new Headers({ cookie }) } }, () => null);
}

test("legacy category search entries preserve category, pagination and language", () => {
  for (const [path, cookie, target, status] of [
    ["/?category=videy", "", "/ms/kategori/videy", 302],
    ["/?category=videy&page=2", "dp_lang=id", "/kategori/videy/halaman/2", 302],
    ["/?category=malaysia", "dp_lang=en", "/en/kategori/malaysia", 302],
    ["/en/home?category=videy&page=2&utm_source=link", "dp_lang=id", "/en/kategori/videy/halaman/2?utm_source=link", 301],
    ["/id?category=ai%2B&page=1", "", "/kategori/ai-plus", 301],
  ]) {
    const res = visit(path, cookie);
    assert.equal(res.status, status);
    assert.equal(res.headers.get("location"), target);
    if (status === 302) assert.equal(res.headers.get("vary"), "Cookie");
  }
  assert.equal(visit("/?q=query&category=videy"), null);
  assert.equal(visit("/?category=unknown"), null);
  assert.equal(visit("/?category=videy", "", "POST"), null);
});
