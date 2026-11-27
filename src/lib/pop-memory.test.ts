import assert from "node:assert/strict";
import { test } from "node:test";
import { POP_MEMORY_MAX, POP_MEMORY_TTL_MS, parsePopMemory, popEntry, prunePopMemory, recordPop } from "./pop-memory.ts";

const T = 1_700_000_000_000;

test("recordPop counts per video and moves it to the most-recent end", () => {
  let l = recordPop([], "a", T);
  l = recordPop(l, "b", T + 1);
  l = recordPop(l, "a", T + 2);
  assert.deepEqual(l.map((e) => [e.id, e.n]), [["b", 1], ["a", 2]]);
  assert.equal(popEntry(l, "a", T + 3)?.n, 2);
  assert.equal(popEntry(l, "c", T + 3), null);
});

test("entries expire 24h after their last pop", () => {
  const l = recordPop([], "a", T);
  assert.equal(popEntry(l, "a", T + POP_MEMORY_TTL_MS - 1)?.n, 1);
  assert.equal(popEntry(l, "a", T + POP_MEMORY_TTL_MS), null);
  // An expired entry restarts at 1.
  assert.equal(popEntry(recordPop(l, "a", T + POP_MEMORY_TTL_MS), "a", T + POP_MEMORY_TTL_MS)?.n, 1);
});

test("memory keeps at most POP_MEMORY_MAX videos, dropping the least recent", () => {
  let l: ReturnType<typeof recordPop> = [];
  for (let i = 0; i <= POP_MEMORY_MAX; i++) l = recordPop(l, `v${i}`, T + i);
  assert.equal(l.length, POP_MEMORY_MAX);
  assert.equal(popEntry(l, "v0", T + 100), null);
  assert.equal(popEntry(l, `v${POP_MEMORY_MAX}`, T + 100)?.n, 1);
});

test("parsePopMemory ignores malformed or expired data", () => {
  assert.deepEqual(parsePopMemory(null, T), []);
  assert.deepEqual(parsePopMemory("{bad", T), []);
  assert.deepEqual(parsePopMemory(JSON.stringify({ id: "a", n: 1, at: T }), T), []);
  const raw = JSON.stringify([{ id: "a", n: 1, at: T }, { id: "", n: 1, at: T }, { id: "b", n: "x", at: T }, { id: "old", n: 1, at: T - POP_MEMORY_TTL_MS }]);
  assert.deepEqual(parsePopMemory(raw, T).map((e) => e.id), ["a"]);
  assert.equal(prunePopMemory([{ id: "a", n: 1, at: T }], T + POP_MEMORY_TTL_MS).length, 0);
});
