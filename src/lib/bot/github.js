/**
 * Read/write JSON di GitHub dengan chunk < 1MB.
 * Env: GH_TOKEN|GITHUB_TOKEN, GH_OWNER|GITHUB_OWNER, GH_REPO|GITHUB_REPO,
 *      GH_BRANCH|GITHUB_BRANCH, GH_DATA_PREFIX|GITHUB_DATA_PREFIX
 *
 * Skema file Streamtape:
 *   data/videos.json          → chunk aktif (baru)
 *   data/videos-p02.json      → chunk penuh berikutnya
 *   data/videos-index.json    → daftar semua chunk
 * Putarin: putarin.json / putarin-p02.json / putarin-index.json
 */

const MAX_CHUNK_BYTES = 850_000; // di bawah limit 1MB GitHub Contents API

function clean(v) {
  return String(v || "")
    .trim()
    .replace(/^GH_(?:TOKEN|OWNER|REPO|BRANCH)\s*=\s*/i, "")
    .trim();
}

function cfg(env) {
  const token = clean(env.GITHUB_TOKEN || env.GH_TOKEN || "");
  const owner = clean(env.GITHUB_OWNER || env.GH_OWNER || "") || "fashfdhgacd";
  let repo = clean(env.GITHUB_REPO || env.GH_REPO || "") || "koleksi_dr_pinguinn";
  if (repo === "koleksi_dr_pinguin" || repo === "koleksi-dr-pinguin") repo = "koleksi_dr_pinguinn";
  const branch = clean(env.GITHUB_BRANCH || env.GH_BRANCH || "main") || "main";
  const prefix = clean(env.GITHUB_DATA_PREFIX || env.GH_DATA_PREFIX || "data").replace(
    /\/$/,
    ""
  ) || "data";
  return { token, owner, repo, branch, prefix };
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "kdp-telegram-bot",
  };
}

function fullPath(prefix, relativePath) {
  return `${prefix}/${relativePath}`.replace(/\/+/g, "/");
}

function baseName(fileName) {
  // videos.json → videos | putarin.json → putarin
  return String(fileName).replace(/\.json$/i, "").replace(/-p\d+$/i, "");
}

function indexName(fileName) {
  return `${baseName(fileName)}-index.json`;
}

function partName(base, n) {
  if (n <= 1) return `${base}.json`;
  return `${base}-p${String(n).padStart(2, "0")}.json`;
}

async function getContentsMeta(env, relativePath) {
  const { token, owner, repo, branch, prefix } = cfg(env);
  if (!token || !owner || !repo) return { ok: false, status: 0, body: null };
  const p = fullPath(prefix, relativePath);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers(token) });
  if (res.status === 404) return { ok: true, status: 404, body: null, path: p };
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, status: res.status, body: null, error: err.slice(0, 200), path: p };
  }
  return { ok: true, status: 200, body: await res.json(), path: p };
}

async function readRawFromMeta(token, body) {
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
    if (!dl.ok) {
      dl = await fetch(body.download_url, {
        headers: { "User-Agent": "kdp-telegram-bot" },
      });
    }
    if (!dl.ok) return "";
    return await dl.text();
  }
  return "";
}

async function readJsonFile(env, relativePath) {
  const { token } = cfg(env);
  const meta = await getContentsMeta(env, relativePath);
  if (!meta.ok) {
    return { ok: false, items: [], sha: null, reason: meta.error || `GET ${meta.status}` };
  }
  if (meta.status === 404) {
    return { ok: true, items: [], sha: null, missing: true };
  }
  const raw = await readRawFromMeta(token, meta.body);
  let items = [];
  try {
    const data = JSON.parse(raw || "[]");
    items = Array.isArray(data) ? data : [];
  } catch {
    items = [];
  }
  return { ok: true, items, sha: meta.body?.sha || null, missing: false };
}

async function putJsonFile(env, relativePath, items, sha) {
  const { token, owner, repo, branch, prefix } = cfg(env);
  if (!token || !owner || !repo) return { skipped: true };

  const p = fullPath(prefix, relativePath);
  const content = JSON.stringify(items, null, 2) + "\n";
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${p}`;

  let currentSha = sha;
  if (!currentSha) {
    const existing = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, {
      headers: headers(token),
    });
    if (existing.ok) {
      const body = await existing.json();
      currentSha = body.sha;
    }
  }

  const payload = {
    message: `bot: update ${relativePath}`,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
  };
  if (currentSha) payload.sha = currentSha;

  const res = await fetch(api, {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub PUT ${relativePath} ${res.status}: ${err.slice(0, 250)}`);
  }
  return { skipped: false, path: p, bytes: Buffer.byteLength(content, "utf8") };
}

/** Baca index chunk; kalau belum ada, default [base.json] */
async function readIndex(env, fileName) {
  const idx = indexName(fileName);
  const got = await readJsonFile(env, idx);
  if (!got.ok) return { ok: false, parts: [partName(baseName(fileName), 1)], sha: null, reason: got.reason };
  if (got.missing || !Array.isArray(got.items) || !got.items.length) {
    return {
      ok: true,
      parts: [partName(baseName(fileName), 1)],
      sha: got.sha,
      missing: true,
    };
  }
  // index boleh array string atau { parts: [] }
  const parts = Array.isArray(got.items)
    ? got.items.map(String)
    : Array.isArray(got.items.parts)
      ? got.items.parts.map(String)
      : [partName(baseName(fileName), 1)];
  return { ok: true, parts, sha: got.sha, missing: false };
}

/**
 * Kompatibel API lama: baca SEMUA chunk lalu merge (baru di depan).
 * Dipakai kalau masih ada pemanggil fetchJsonFromGithub(fileName).
 */
export async function fetchJsonFromGithub(env, relativePath) {
  const { token, owner, repo } = cfg(env);
  if (!token || !owner || !repo) {
    return { ok: false, items: [], sha: null, reason: "missing_github_env" };
  }

  // Kalau path index / part eksplisit, baca file itu saja
  if (/-index\.json$/i.test(relativePath) || /-p\d+\.json$/i.test(relativePath)) {
    return readJsonFile(env, relativePath);
  }

  const index = await readIndex(env, relativePath);
  if (!index.ok) {
    return { ok: false, items: [], sha: null, reason: index.reason };
  }

  const all = [];
  let lastSha = null;
  for (const part of index.parts) {
    const got = await readJsonFile(env, part);
    if (!got.ok) continue;
    if (got.sha) lastSha = got.sha;
    if (got.items?.length) all.push(...got.items);
  }

  // Fallback: file monolih lama tanpa index
  if (!all.length) {
    const legacy = await readJsonFile(env, relativePath);
    if (legacy.ok && legacy.items.length) {
      return { ok: true, items: legacy.items, sha: legacy.sha, pathName: relativePath };
    }
  }

  return {
    ok: true,
    items: all,
    sha: lastSha,
    pathName: relativePath,
    parts: index.parts,
  };
}

/**
 * Upsert 1 record ke chunk aktif (< 1MB). Chunk penuh → buat file baru.
 * Tidak menulis ulang file 1.9MB.
 */
export async function upsertVideoToGithub(env, fileName, record) {
  const { token, owner, repo } = cfg(env);
  if (!token || !owner || !repo) {
    return { ok: false, reason: "missing_github_env" };
  }

  // Jangan sentuh arsip raksasa videos.json / putarin.json.
  // Data baru selalu ke *-latest.json (chunk < 1MB).
  const map = {
    "videos.json": "videos-latest.json",
    "putarin.json": "putarin-latest.json",
    "campur.json": "campur-latest.json",
  };
  fileName = map[fileName] || fileName;

  const base = baseName(fileName);
  const index = await readIndex(env, fileName);
  if (!index.ok) return { ok: false, reason: index.reason };

  let parts = index.parts.slice();
  if (!parts.length) parts = [partName(base, 1)];

  // Cari apakah id sudah ada di salah satu chunk (update in-place)
  const keyOf = (it) =>
    String(it.id || "")
      .toLowerCase()
      .trim();

  const want = keyOf(record);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const got = await readJsonFile(env, part);
    if (!got.ok) continue;
    const idx = got.items.findIndex((it) => keyOf(it) === want);
    if (idx >= 0) {
      const next = got.items.slice();
      const merged = { ...next[idx], ...record, updated_at: new Date().toISOString() };
      next.splice(idx, 1);
      // Link baru / update harus di depan katalog, bukan tetap di belakang.
      next.unshift(merged);
      await putJsonFile(env, part, next, got.sha);
      return {
        ok: true,
        action: "updated",
        file: part,
        total: next.length,
        record: merged,
      };
    }
  }

  // Insert di chunk aktif = parts[0] (paling baru). Kalau penuh, buat part baru di depan.
  let active = parts[0];
  let got = await readJsonFile(env, active);
  if (!got.ok) return { ok: false, reason: got.reason };

  let items = got.items.slice();
  items.unshift(record);
  let content = JSON.stringify(items, null, 2) + "\n";
  let bytes = Buffer.byteLength(content, "utf8");

  if (bytes > MAX_CHUNK_BYTES && got.items.length > 0) {
    const nextNum = parts.length + 1;
    const archivedName = partName(base, nextNum);
    const fullItems = got.items.slice();
    await putJsonFile(env, archivedName, fullItems, null);

    items = [record];
    content = JSON.stringify(items, null, 2) + "\n";
    await putJsonFile(env, active, items, got.sha);

    const newParts = [active, archivedName, ...parts.slice(1).filter((x) => x !== archivedName && x !== active)];
    await putJsonFile(env, indexName(fileName), newParts, index.missing ? null : index.sha);

    return {
      ok: true,
      action: "created",
      file: active,
      rotated: archivedName,
      total: 1,
      record,
    };
  }

  await putJsonFile(env, active, items, got.sha);

  if (index.missing || index.parts[0] !== active) {
    const newParts = [active, ...parts.filter((x) => x !== active)];
    await putJsonFile(env, indexName(fileName), newParts, index.missing ? null : index.sha);
  }

  return {
    ok: true,
    action: "created",
    file: active,
    total: items.length,
    record,
  };
}

/** API lama: push full content (masih dipakai fallback). */
export async function pushJsonToGithub(env, relativePath, content, sha) {
  let items = [];
  try {
    const data = JSON.parse(content);
    items = Array.isArray(data) ? data : [];
  } catch {
    throw new Error("pushJsonToGithub: content bukan JSON array");
  }
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_CHUNK_BYTES) {
    throw new Error(
      `File terlalu besar (${bytes} byte). Pakai upsertVideoToGithub agar di-chunk.`
    );
  }
  return putJsonFile(env, relativePath, items, sha);
}
