#!/usr/bin/env node
/**
 * Bluesky auto-poster (GitHub Actions, .github/workflows/bluesky-post.yml, every 4 h = max 6/day).
 *
 * One run = at most ONE post: the newest public video (added in the last few days, live in the
 * public sitemap, passing the site's title checks and the stricter Bluesky blocklist in
 * scripts/lib/bluesky-post-lib.mjs), not posted before. The post is text + a link card without an
 * image (never the video thumbnail), self-labelled adult ("porn"), linking with UTM tags.
 * Posted ids are kept in data/bluesky-posted.json (committed by the workflow, [skip ci]).
 * Once, it fills the profile display name / bio / adult label if they are empty.
 *
 * Official AT Protocol XRPC over fetch: com.atproto.server.createSession, com.atproto.repo.*.
 * Env: BLUESKY_HANDLE, BLUESKY_APP_PASSWORD (app password, GitHub secrets). Never logged.
 *
 *   node scripts/bluesky-post.mjs            post (needs env)
 *   node scripts/bluesky-post.mjs --dry-run  print what would be posted, change nothing
 */
import { readFile, writeFile } from "node:fs/promises";
import { MAX_PER_DAY, ORIGIN, buildPost, pickNext, postsLast24h, profilePatch } from "./lib/bluesky-post-lib.mjs";

const PDS = process.env.BLUESKY_PDS || "https://bsky.social";
const STATE = new URL("../data/bluesky-posted.json", import.meta.url);
const CATALOG = [
  new URL("../data/videos-latest.json", import.meta.url),
  new URL("../data/videos-latest-p02.json", import.meta.url),
];
const DRY = process.argv.includes("--dry-run");

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch {
    return fallback;
  }
}

async function getText(url) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "koleksi-bluesky-post/1.0" } });
      if (r.ok) return await r.text();
      console.warn(`${url} -> HTTP ${r.status}`);
    } catch (e) {
      console.warn(`${url} -> ${e.message}`);
    }
    await new Promise((res) => setTimeout(res, 2000 * i));
  }
  throw new Error(`gagal ambil ${url}`);
}

/** Video ids in the LIVE sitemap: public and indexable only (hidden / review-pending are not listed). */
async function liveIds() {
  const index = await getText(`${ORIGIN}/sitemap.xml`);
  const maps = [...index.matchAll(/<loc>([^<]+sitemap-watch-[^<]+)<\/loc>/g)].map((m) => m[1]);
  const ids = new Set();
  for (const m of maps) {
    const xml = await getText(m);
    for (const x of xml.matchAll(/<loc>https:\/\/koleksidrpinguin\.com\/watch\/([^<?#/]+)<\/loc>/g)) {
      ids.add(decodeURIComponent(x[1]));
    }
  }
  return ids;
}

async function xrpc(method, { token, body, query } = {}) {
  const url = new URL(`/xrpc/${method}`, PDS);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // Error text from the server only (never the request, which may hold the password).
  if (!res.ok) throw Object.assign(new Error(`${method}: HTTP ${res.status} ${data.error || ""} ${data.message || ""}`.trim()), { status: res.status, code: data.error });
  return data;
}

async function main() {
  const state = await readJson(STATE, { posted: [] });
  state.posted ||= [];
  const now = Date.now();
  const recent = postsLast24h(state, now);
  if (recent >= MAX_PER_DAY) {
    console.log(`Sudah ${recent} post dalam 24 jam (maks ${MAX_PER_DAY}). Lewati.`);
    return;
  }

  const items = [];
  for (const u of CATALOG) {
    const d = await readJson(u, []);
    if (Array.isArray(d)) items.push(...d);
  }
  const ids = await liveIds();
  console.log(`Katalog: ${items.length} item · sitemap live: ${ids.size} video.`);
  const { item, skipped } = pickNext(items, ids, state, now);
  for (const [id, why] of skipped.slice(0, 15)) console.log(`  lewati ${id}: ${why}`);
  if (!item) {
    console.log("Tidak ada video baru yang lolos cek. Tidak posting.");
    return;
  }
  const record = buildPost(item);
  console.log(`Pilih ${item.id}: ${record.text.replace(/\n/g, " ⏎ ")}`);
  if (DRY) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  const identifier = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) throw new Error("BLUESKY_HANDLE / BLUESKY_APP_PASSWORD belum di-set.");
  const session = await xrpc("com.atproto.server.createSession", { body: { identifier, password } });
  const token = session.accessJwt;
  const did = session.did;

  if (!state.profileDone) {
    try {
      let current = null;
      try {
        current = (await xrpc("com.atproto.repo.getRecord", {
          token,
          query: { repo: did, collection: "app.bsky.actor.profile", rkey: "self" },
        })).value;
      } catch (e) {
        if (e.status !== 400 && e.code !== "RecordNotFound") throw e;
      }
      const patch = profilePatch(current);
      if (patch) {
        await xrpc("com.atproto.repo.putRecord", {
          token,
          body: { repo: did, collection: "app.bsky.actor.profile", rkey: "self", record: patch },
        });
        console.log("Profil diisi (nama / bio / label 18+).");
      } else console.log("Profil sudah terisi, tidak diubah.");
      state.profileDone = true;
    } catch (e) {
      console.warn(`Profil gagal diisi: ${e.message}`);
    }
  }

  const res = await xrpc("com.atproto.repo.createRecord", {
    token,
    body: { repo: did, collection: "app.bsky.feed.post", record },
  });
  const rkey = String(res.uri || "").split("/").pop();
  const web = `https://bsky.app/profile/${session.handle || did}/post/${rkey}`;
  state.posted.push({ id: String(item.id), title: item.title, uri: res.uri, url: web, at: new Date().toISOString() });
  state.posted = state.posted.slice(-500);
  await writeFile(STATE, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`Terposting: ${web}`);
}

main().catch((e) => {
  console.error(`GAGAL: ${e.message}`);
  process.exit(1);
});
