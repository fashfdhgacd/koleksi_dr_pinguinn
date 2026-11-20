import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isJpegBytes, toJpeg } from "./to-jpeg.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = join(dir, "../../scripts/fixtures/tiny-poster.webp");

test("toJpeg turns a webp poster into a real JPEG", async () => {
  const webp = readFileSync(fixture);
  assert.equal(webp[0], 0x52);
  const jpeg = await toJpeg(webp);
  assert.ok(jpeg);
  assert.equal(isJpegBytes(jpeg), true);
  assert.ok(jpeg!.byteLength > 32);
  assert.equal(jpeg![0], 0xff);
  assert.equal(jpeg![1], 0xd8);
});

test("toJpeg passes a JPEG through and rejects empty/non-image bytes", async () => {
  const webp = readFileSync(fixture);
  const jpeg = await toJpeg(webp);
  const again = await toJpeg(jpeg!);
  assert.equal(again, jpeg);
  assert.equal(await toJpeg(new Uint8Array([0, 1, 2, 3])), null);
  assert.equal(await toJpeg(new Uint8Array(0)), null);
  assert.equal(isJpegBytes(null), false);
});
