import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let server;
let videoJsonLd;

before(async () => {
  server = await createServer({
    configFile: false,
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    server: { middlewareMode: true },
    appType: "custom",
  });
  ({ videoJsonLd } = await server.ssrLoadModule("/src/lib/seo.ts"));
});

after(async () => {
  await server?.close();
});

const video = { id: "test123", title: "Test video", description: "Test description" };

test("VideoObject never invents an upload date", () => {
  for (const uploadDate of [undefined, null, "", "invalid", "2099-01-01", 0]) {
    const schema = videoJsonLd({ ...video, uploadDate });
    assert.equal(Object.hasOwn(schema, "uploadDate"), false);
    assert.equal(schema["@type"], "VideoObject");
    assert.equal(schema.url, "https://koleksidrpinguin.com/watch/test123");
  }
});

test("VideoObject retains valid catalog dates", () => {
  for (const uploadDate of ["2024-03-15T12:30:00Z", 1710505800, "1710505800000"]) {
    const schema = videoJsonLd({ ...video, uploadDate });
    assert.equal(schema.uploadDate, "2024-03-15T12:30:00Z");
  }
});
