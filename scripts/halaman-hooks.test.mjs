// React error #300: a component rendered fewer hooks than the previous render.
// /halaman routes keep their parent mounted, so a parent must not return before a later hook.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const FILES = [
  "src/routes/index.tsx",
  "src/routes/halaman.$page.tsx",
  "src/routes/kategori.tsx",
  "src/routes/kategori.$slug.tsx",
  "src/routes/kategori.$slug.halaman.$page.tsx",
  "src/routes/cari.$slug.tsx",
  "src/routes/cari.$slug.halaman.$page.tsx",
];

const HOOK_AT = /\b(?:use[A-Z][A-Za-z0-9]*|Route\.use[A-Za-z]+)\s*\(/y;

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, (m) => `"${" ".repeat(Math.max(0, m.length - 2))}"`);
}

/** Function bodies where a top-level return appears before a later hook. */
export function hooksAfterReturn(src) {
  const code = stripCommentsAndStrings(src);
  const hits = new Set();
  const fnRe = /function\s+([A-Za-z0-9_]+)\s*\(/g;
  let m;
  while ((m = fnRe.exec(code))) {
    const open = code.indexOf("{", m.index);
    if (open < 0) continue;
    let depth = 0;
    let returned = false;
    let i = open;
    for (; i < code.length; i++) {
      const ch = code[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) break;
      } else if (depth === 1) {
        if (code.startsWith("return", i) && !/\w/.test(code[i - 1] || "") && !/\w/.test(code[i + 6] || "")) {
          returned = true;
          i += 5;
        } else if (returned) {
          HOOK_AT.lastIndex = i;
          if (HOOK_AT.exec(code)) hits.add(m[1]);
        }
      }
    }
    fnRe.lastIndex = i + 1;
  }
  return [...hits];
}

test("the guard catches a return before a later hook", () => {
  const bad = `function Bad() {
    const matches = useMatches();
    if (matches.length) return <Outlet />;
    const params = Route.useParams();
    return params;
  }`;
  assert.deepEqual(hooksAfterReturn(bad), ["Bad"]);
  const good = `function Good() {
    const matches = useMatches();
    const params = Route.useParams();
    if (matches.length) return <Outlet />;
    return params;
  }`;
  assert.deepEqual(hooksAfterReturn(good), []);
});

test("home, kategori, and cari /halaman routes never call a hook after returning", () => {
  const bad = [];
  for (const file of FILES) {
    const names = hooksAfterReturn(readFileSync(new URL("../" + file, import.meta.url), "utf8"));
    for (const name of names) bad.push(`${file}: ${name}`);
  }
  assert.deepEqual(bad, []);
});
