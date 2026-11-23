import assert from "node:assert/strict";
import test from "node:test";
import { readWatchListsOnce, withWatchRequestReads } from "../server/lib/watch-request-reads.ts";

test("middleware and SSR reuse reads only within the same watch request", async () => {
  let calls = 0;
  const read = async () => ++calls;
  const request = () => withWatchRequestReads(async () =>
    Promise.all([readWatchListsOnce(read), readWatchListsOnce(read)]));
  const [a, b] = await Promise.all([request(), request()]);
  assert.deepEqual(a, [1, 1]);
  assert.deepEqual(b, [2, 2]);
  assert.equal(await readWatchListsOnce(read), 3);
  assert.equal(await readWatchListsOnce(read), 4);
});
