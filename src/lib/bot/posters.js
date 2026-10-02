/**
 * Persist poster URLs in data/latest-posters.json (id → https URL).
 * Catalog + /thumb/$id prefer this map over empty video.poster fields.
 */
import { fetchJsonFromGithub } from "@/lib/bot/github.js";
import { fetchPutarinMeta, fetchStreamtapeMeta } from "@/lib/bot/providers.js";

const POSTERS_FILE = "latest-posters.json";

function scrubToken(v) {
  return String(v || "")
    .trim()
    .replace(/^GH_(?:TOKEN|OWNER|REPO|BRANCH)\s*=\s*/i, "")
    .trim();
}

function cfg(env) {
  const token = scrubToken(env.GITHUB_TOKEN || env.GH_TOKEN || "");
  const owner = scrubToken(env.GITHUB_OWNER || env.GH_OWNER || "") || "fashfdhgacd";
  let repo = scrubToken(env.GITHUB_REPO || env.GH_REPO || "") || "koleksi_dr_pinguinn";
  if (repo === "koleksi_dr_pinguin" || repo === "koleksi-dr-pinguin") repo = "koleksi_dr_pinguinn";
  const branch = scrubToken(env.GITHUB_BRANCH || env.GH_BRANCH || "main") || "main";
  const prefix = scrubToken(env.GITHUB_DATA_PREFIX || env.GH_DATA_PREFIX || "data").replace(/\/$/, "") || "data";
  return { token, owner, repo, branch, prefix };
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "kdp-telegram-bot",
  };
}

function isHttpPoster(url) {
  const u = String(url || "").trim();
  if (!/^https:\/\//i.test(u)) return false;
  if (/placeholder|brand-poster|data:/i.test(u)) return false;
  if (/\/api\/(img-proxy|tape-thumb|embed-thumb|puterin-thumb)/i.test(u)) return false;
  return true;
}

function cleanId(id) {
  const s = String(id || "").trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(s)) return "";
  return s;
}

function asPosterMap(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    const id = cleanId(k);
    if (id && isHttpPoster(v)) out[id] = String(v).trim();
  }
  return out;
}

async function getMeta(env, relativePath) {
  const { token, owner, repo, branch, prefix } = cfg(env);
  if (!token || !owner || !repo) return { ok: false, status: 0, body: null, reason: "missing_github_env" };
  const path = `${prefix}/${relativePath}`.replace(/\/+/g, "/");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (res.status === 404) return { ok: true, status: 404, body: null, path };
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, status: res.status, body: null, error: err.slice(0, 200), path };
  }
  return { ok: true, status: 200, body: await res.json(), path };
}

async function readRaw(token, body) {
  if (!body) return "";
  if (body.encoding === "base64" && body.content) {
    return Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8");
  }
  if (body.download_url) {
    let dl = await fetch(body.download_url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "kdp-telegram-bot",
        Accept: "application/vnd.github.raw",
      },
    });
    if (!dl.ok) dl = await fetch(body.download_url, { headers: { "User-Agent": "kdp-telegram-bot" } });
    if (!dl.ok) return "";
    return await dl.text();
  }
  return "";
}

export async function loadLatestPosters(env) {
  const { token } = cfg(env);
  const meta = await getMeta(env, POSTERS_FILE);
  if (!meta.ok) return { ok: false, map: {}, sha: null, reason: meta.error || meta.reason || `GET ${meta.status}` };
  if (meta.status === 404) return { ok: true, map: {}, sha: null, missing: true };
  const raw = await readRaw(token, meta.body);
  let parsed = {};
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    parsed = {};
  }
  return { ok: true, map: asPosterMap(parsed), sha: meta.body?.sha || null, missing: false };
}

async function putObject(env, relativePath, obj, sha) {
  const { token, owner, repo, branch, prefix } = cfg(env);
  if (!token || !owner || !repo) return { skipped: true, reason: "missing_github_env" };
  const path = `${prefix}/${relativePath}`.replace(/\/+/g, "/");
  const content = `${JSON.stringify(obj, null, 2)}\n`;
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  let useSha = sha;
  if (!useSha) {
    const cur = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders(token) });
    if (cur.ok) useSha = (await cur.json()).sha;
  }
  const body = {
    message: `bot: update ${relativePath}`,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
  };
  if (useSha) body.sha = useSha;
  const res = await fetch(api, {
    method: "PUT",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    const cur = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders(token) });
    if (cur.ok) {
      const fresh = await cur.json();
      const retry = await fetch(api, {
        method: "PUT",
        headers: { ...ghHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, sha: fresh.sha }),
      });
      if (!retry.ok) {
        const err = await retry.text();
        throw new Error(`GitHub PUT ${relativePath} ${retry.status} (after 409): ${err.slice(0, 250)}`);
      }
      return { skipped: false, path, retried409: true };
    }
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub PUT ${relativePath} ${res.status}: ${err.slice(0, 250)}`);
  }
  return { skipped: false, path };
}

/**
 * Merge id→url entries into data/latest-posters.json.
 * @returns {{ ok: boolean, added: number, updated: number, total: number, error?: string }}
 */
export async function mergeLatestPosters(env, entries) {
  const incoming = asPosterMap(entries || {});
  const keys = Object.keys(incoming);
  if (!keys.length) return { ok: true, added: 0, updated: 0, total: 0 };

  const loaded = await loadLatestPosters(env);
  if (!loaded.ok) return { ok: false, added: 0, updated: 0, total: 0, error: loaded.reason || "load_failed" };

  const next = { ...loaded.map };
  let added = 0;
  let updated = 0;
  for (const [id, url] of Object.entries(incoming)) {
    if (!next[id]) {
      next[id] = url;
      added += 1;
    } else if (next[id] !== url) {
      next[id] = url;
      updated += 1;
    }
  }
  if (!added && !updated) {
    return { ok: true, added: 0, updated: 0, total: Object.keys(next).length };
  }

  try {
    await putObject(env, POSTERS_FILE, next, loaded.sha);
    return { ok: true, added, updated, total: Object.keys(next).length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, added: 0, updated: 0, total: Object.keys(loaded.map).length, error: msg };
  }
}

function hostOf(item) {
  const src = String(item?.source || "").toLowerCase();
  const embed = String(item?.embed || item?.direct || "").toLowerCase();
  if (src.includes("streamtape") || /streamtape\.|strcloud/.test(embed)) return "streamtape";
  if (src.includes("putarin") || src.includes("puterin") || /putarin\.|puterin\./.test(embed)) return "putarin";
  return "";
}

function itemHasPoster(item, posters) {
  const id = cleanId(item?.id);
  if (id && isHttpPoster(posters[id])) return true;
  if (isHttpPoster(item?.poster) || isHttpPoster(item?.thumbnail)) return true;
  return false;
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Fill posters for catalog items that lack thumbs (Streamtape / Putarin).
 * Writes to latest-posters.json only (catalog reads that map).
 */
export async function refreshMissingPosters(env, { limit = 25 } = {}) {
  const n = Math.min(40, Math.max(1, Number(limit) || 25));
  const loaded = await loadLatestPosters(env);
  if (!loaded.ok) {
    return { ok: false, checked: 0, filled: 0, skipped: 0, error: loaded.reason || "load_failed", text: "Gagal baca latest-posters.json." };
  }

  const files = ["videos-latest.json", "putarin-latest.json"];
  const pool = [];
  for (const file of files) {
    try {
      const res = await fetchJsonFromGithub(env, file);
      if (res?.ok && Array.isArray(res.items)) pool.push(...res.items);
    } catch {
      /* ignore */
    }
  }

  const missing = [];
  const seen = new Set();
  for (const item of pool) {
    const id = cleanId(item?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (itemHasPoster(item, loaded.map)) continue;
    const host = hostOf(item);
    if (host !== "streamtape" && host !== "putarin") continue;
    missing.push({ id, host, title: String(item.title || id) });
    if (missing.length >= n) break;
  }

  if (!missing.length) {
    return {
      ok: true,
      checked: 0,
      filled: 0,
      skipped: 0,
      remaining: 0,
      text: "Tidak ada video Streamtape/Putarin tanpa poster (batas batch).",
    };
  }

  const found = {};
  const notes = [];
  await mapPool(missing, 4, async (item) => {
    try {
      if (item.host === "streamtape") {
        const meta = await fetchStreamtapeMeta(item.id, env);
        if (isHttpPoster(meta.thumb)) {
          found[item.id] = meta.thumb;
          notes.push(`✅ ${item.id} — splash/info`);
          return;
        }
        notes.push(`⏭️ ${item.id} — API tanpa thumb`);
        return;
      }
      if (item.host === "putarin") {
        const meta = await fetchPutarinMeta(item.id, env);
        if (isHttpPoster(meta.thumb)) {
          found[item.id] = meta.thumb;
          notes.push(`✅ ${item.id} — putarin`);
          return;
        }
        notes.push(`⏭️ ${item.id} — putarin tanpa thumb`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notes.push(`⚠️ ${item.id} — ${msg.slice(0, 80)}`);
    }
  });

  const filledIds = Object.keys(found);
  let merge = { ok: true, added: 0, updated: 0, total: Object.keys(loaded.map).length };
  if (filledIds.length) {
    merge = await mergeLatestPosters(env, found);
  }

  const summary = [
    `✅ ${filledIds.length} poster diisi · ⏭️ ${missing.length - filledIds.length} kosong · map total ${merge.total || Object.keys(loaded.map).length + filledIds.length}`,
    "",
    ...notes.slice(0, 30),
  ].join("\n");

  return {
    ok: Boolean(merge.ok),
    checked: missing.length,
    filled: filledIds.length,
    skipped: missing.length - filledIds.length,
    remaining: Math.max(0, missing.length - filledIds.length),
    error: merge.error,
    text: summary,
  };
}

export { isHttpPoster, cleanId as cleanPosterId };
