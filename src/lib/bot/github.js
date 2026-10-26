import { chunkFileName, feedBase, indexFileName } from "../catalog/chunk-contract.js";
const Y = 85e4,
  X = {
    "videos.json": "videos-latest.json",
    "putarin.json": "putarin-latest.json",
    "campur.json": "campur-latest.json",
  };
function B(t) {
  return String(t || "")
    .trim()
    .replace(/^GH_(?:TOKEN|OWNER|REPO|BRANCH)\s*=\s*/i, "")
    .trim();
}
function G(t) {
  const e = B(t.GITHUB_TOKEN || t.GH_TOKEN || ""),
    n = B(t.GITHUB_OWNER || t.GH_OWNER || "") || "fashfdhgacd";
  let s = B(t.GITHUB_REPO || t.GH_REPO || "") || "koleksi_dr_pinguinn";
  (s === "koleksi_dr_pinguin" || s === "koleksi-dr-pinguin") &&
    (s = "koleksi_dr_pinguinn");
  const i = B(t.GITHUB_BRANCH || t.GH_BRANCH || "main") || "main",
    c =
      B(t.GITHUB_DATA_PREFIX || t.GH_DATA_PREFIX || "data").replace(
        /\/$/,
        "",
      ) || "data";
  return { token: e, owner: n, repo: s, branch: i, prefix: c };
}
function H(t) {
  return {
    Authorization: `Bearer ${t}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "kdp-telegram-bot",
  };
}
function L(t, e) {
  return `${t}/${e}`.replace(/\/+/g, "/");
}
// Chunk naming is shared with the site loader and build guard (src/lib/catalog/chunk-contract.js).
function O(t) {
  return feedBase(t);
}
function I(t) {
  return indexFileName(t);
}
function j(t, e) {
  return chunkFileName(t, e);
}
function V(t) {
  return X[t] || t;
}
function K(t) {
  return String(t?.id || "")
    .toLowerCase()
    .trim();
}
function F(t) {
  const e = String(t?.embed || t?.direct || t?.video_url || "")
      .toLowerCase()
      .trim(),
    n = e.match(/\/(?:e|v|d|f|watch)\/([a-z0-9_-]+)/i);
  return n ? n[1].toLowerCase() : e;
}
async function z(t, e) {
  const { token: n, owner: s, repo: i, branch: c, prefix: l } = G(t);
  if (!n || !s || !i) return { ok: !1, status: 0, body: null };
  const f = L(l, e),
    u = `https://api.github.com/repos/${s}/${i}/contents/${f}?ref=${encodeURIComponent(c)}`,
    r = await fetch(u, { headers: H(n) });
  if (r.status === 404) return { ok: !0, status: 404, body: null, path: f };
  if (!r.ok) {
    const g = await r.text();
    return {
      ok: !1,
      status: r.status,
      body: null,
      error: g.slice(0, 200),
      path: f,
    };
  }
  return { ok: !0, status: 200, body: await r.json(), path: f };
}
async function W(t, e) {
  if (!e) return "";
  if (e.encoding === "base64" && e.content)
    return Buffer.from(e.content.replace(/\n/g, ""), "base64").toString("utf8");
  if (e.download_url) {
    let n = await fetch(e.download_url, {
      headers: {
        Authorization: `Bearer ${t}`,
        "User-Agent": "kdp-telegram-bot",
        Accept: "application/vnd.github.raw",
      },
    });
    return (
      n.ok ||
        (n = await fetch(e.download_url, {
          headers: { "User-Agent": "kdp-telegram-bot" },
        })),
      n.ok ? await n.text() : ""
    );
  }
  return "";
}
async function S(t, e) {
  const { token: n } = G(t),
    s = await z(t, e);
  if (!s.ok)
    return {
      ok: !1,
      items: [],
      sha: null,
      reason: s.error || `GET ${s.status}`,
    };
  if (s.status === 404) return { ok: !0, items: [], sha: null, missing: !0 };
  const i = await W(n, s.body);
  let c = [];
  try {
    const l = JSON.parse(i || "[]");
    c = Array.isArray(l) ? l : [];
  } catch {
    // A corrupt chunk must not read as empty: the caller would rewrite it and lose videos.
    return { ok: !1, items: [], sha: null, reason: `invalid_json ${e}` };
  }
  return { ok: !0, items: c, sha: s.body?.sha || null, missing: !1 };
}
async function T(t, e, n, s, blind409 = !1) {
  const { token: i, owner: c, repo: l, branch: f, prefix: u } = G(t);
  if (!i || !c || !l) return { skipped: !0 };
  const r = L(u, e),
    g = JSON.stringify(n, null, 2) + "\n",
    w = `https://api.github.com/repos/${c}/${l}/contents/${r}`;
  let y = s;
  if (!y) {
    const d = await fetch(`${w}?ref=${encodeURIComponent(f)}`, {
      headers: H(i),
    });
    d.ok && (y = (await d.json()).sha);
  }
  const $ = {
    message: `bot: update ${e}`,
    content: Buffer.from(g, "utf8").toString("base64"),
    branch: f,
  };
  y && ($.sha = y);
  const b = await fetch(w, {
    method: "PUT",
    headers: { ...H(i), "Content-Type": "application/json" },
    body: JSON.stringify($),
  });
  if ((b.status === 409 || b.status === 422) && !blind409) {
    // sha moved under us (another writer). Never resend stale content: the caller re-reads,
    // re-merges and retries (upsertVideosBatch).
    const d = await b.text();
    if (b.status === 409 || /sha/i.test(d)) {
      const err = new Error(`GitHub PUT ${e} ${b.status} conflict: ${d.slice(0, 200)}`);
      err.conflict = !0;
      throw err;
    }
    throw new Error(`GitHub PUT ${e} ${b.status}: ${d.slice(0, 250)}`);
  }
  if (b.status === 409) {
    const d = await fetch(`${w}?ref=${encodeURIComponent(f)}`, {
      headers: H(i),
    });
    if (d.ok) {
      const _ = await d.json(),
        x = { ...$, sha: _.sha },
        A = await fetch(w, {
          method: "PUT",
          headers: { ...H(i), "Content-Type": "application/json" },
          body: JSON.stringify(x),
        });
      if (!A.ok) {
        const N = await A.text();
        throw new Error(
          `GitHub PUT ${e} ${A.status} (after 409): ${N.slice(0, 250)}`,
        );
      }
      return {
        skipped: !1,
        path: r,
        bytes: Buffer.byteLength(g, "utf8"),
        retried409: !0,
      };
    }
  }
  if (!b.ok) {
    const d = await b.text();
    throw new Error(`GitHub PUT ${e} ${b.status}: ${d.slice(0, 250)}`);
  }
  return { skipped: !1, path: r, bytes: Buffer.byteLength(g, "utf8") };
}
// Never commit an index that points at a chunk which is not on GitHub (site would miss it).
async function writeIndex(t, e, parts, sha) {
  for (const part of parts) {
    const r = await S(t, part);
    if (!r.ok || r.missing) throw new Error(`index_part_missing ${part}: ${r.reason || "404"}`);
  }
  return T(t, I(e), parts, sha);
}
async function M(t, e) {
  const n = I(e),
    s = await S(t, n);
  return s.ok
    ? s.missing || !Array.isArray(s.items) || !s.items.length
      ? { ok: !0, parts: [j(O(e), 1)], sha: s.sha, missing: !0 }
      : {
          ok: !0,
          parts: Array.isArray(s.items)
            ? s.items.map(String)
            : Array.isArray(s.items.parts)
              ? s.items.parts.map(String)
              : [j(O(e), 1)],
          sha: s.sha,
          missing: !1,
        }
    : { ok: !1, parts: [j(O(e), 1)], sha: null, reason: s.reason };
}
export async function fetchJsonFromGithub(t, e) {
  const { token: n, owner: s, repo: i } = G(t);
  if (!n || !s || !i)
    return { ok: !1, items: [], sha: null, reason: "missing_github_env" };
  if (/-index\.json$/i.test(e) || /-p\d+\.json$/i.test(e)) return S(t, e);
  const c = await M(t, e);
  if (!c.ok) return { ok: !1, items: [], sha: null, reason: c.reason };
  const l = [];
  let f = null;
  for (const u of c.parts) {
    const r = await S(t, u);
    r.ok && (r.sha && (f = r.sha), r.items?.length && l.push(...r.items));
  }
  if (!l.length) {
    const u = await S(t, e);
    if (u.ok && u.items.length)
      return { ok: !0, items: u.items, sha: u.sha, pathName: e };
  }
  return { ok: !0, items: l, sha: f, pathName: e, parts: c.parts };
}
async function upsertVideosBatchOnce(t, e, n) {
  const { token: s, owner: i, repo: c } = G(t);
  if (!s || !i || !c)
    return {
      ok: !1,
      created: 0,
      skipped: 0,
      updated: 0,
      file: null,
      total: 0,
      errors: ["missing_github_env"],
    };
  const l = Array.isArray(n) ? n.filter(Boolean) : [];
  if (!l.length)
    return {
      ok: !0,
      created: 0,
      skipped: 0,
      updated: 0,
      file: null,
      total: 0,
      errors: [],
    };
  e = V(e);
  const f = O(e),
    u = await M(t, e);
  if (!u.ok)
    return {
      ok: !1,
      created: 0,
      skipped: 0,
      updated: 0,
      file: null,
      total: 0,
      errors: [u.reason || "index_read_failed"],
    };
  let r = u.parts.slice();
  r.length || (r = [j(f, 1)]);
  const g = new Map(),
    w = new Set(),
    y = new Set(),
    $ = [];
  for (const a of r) {
    const o = await S(t, a);
    if (!o.ok) {
      $.push(`${a}: ${o.reason || "read_failed"}`);
      continue;
    }
    g.set(a, { items: o.items.slice(), sha: o.sha });
    for (const h of o.items) {
      const C = K(h),
        E = F(h);
      (C && w.add(C), E && y.add(E));
    }
  }
  let b = 0,
    d = 0;
  const _ = $.slice(),
    x = [],
    A = new Set(),
    N = new Set();
  for (const a of l) {
    const o = K(a),
      h = F(a);
    if ((o && (w.has(o) || A.has(o))) || (h && (y.has(h) || N.has(h)))) {
      d += 1;
      continue;
    }
    (o && A.add(o), h && N.add(h), x.push(a));
  }
  if (!x.length) {
    const a = r[0],
      o = g.get(a);
    return {
      ok: !0,
      created: 0,
      skipped: d,
      updated: 0,
      file: a,
      total: o?.items?.length || 0,
      errors: _,
      results: l.map(() => ({ action: "skipped", reason: "duplicate" })),
    };
  }
  const U = x.slice().reverse();
  let p = r[0],
    k = g.get(p);
  if (!k) {
    const a = await S(t, p);
    if (!a.ok)
      return {
        ok: !1,
        created: 0,
        skipped: d,
        updated: 0,
        file: p,
        total: 0,
        errors: [..._, a.reason || "active_read_failed"],
      };
    k = { items: a.items.slice(), sha: a.sha };
  }
  let m = k.items.slice();
  m = U.concat(m);
  let J = JSON.stringify(m, null, 2) + "\n",
    P = Buffer.byteLength(J, "utf8"),
    R = null;
  try {
    if (P > 85e4 && k.items.length > 0) {
      const a = r.length + 1,
        o = j(f, a),
        h = k.items.slice();
      (await T(t, o, h, null),
        (m = U.slice()),
        (J = JSON.stringify(m, null, 2) + "\n"),
        await T(t, p, m, k.sha));
      const C = [p, o, ...r.slice(1).filter((E) => E !== o && E !== p)];
      (await writeIndex(t, e, C, u.missing ? null : u.sha), (R = o));
    } else if ((await T(t, p, m, k.sha), u.missing || u.parts[0] !== p)) {
      const a = [p, ...r.filter((o) => o !== p)];
      await writeIndex(t, e, a, u.missing ? null : u.sha);
    }
  } catch (a) {
    if (a && a.conflict) throw a;
    const o = a instanceof Error ? a.message : String(a);
    return {
      ok: !1,
      created: 0,
      skipped: d,
      updated: 0,
      file: p,
      total: k.items.length,
      errors: [..._, o],
      rotated: R,
    };
  }
  return (
    (b = U.length),
    {
      ok: !0,
      created: b,
      skipped: d,
      updated: 0,
      file: p,
      total: m.length,
      errors: _,
      rotated: R,
      records: U,
    }
  );
}
export async function upsertVideoToGithub(t, e, n) {
  const s = await upsertVideosBatch(t, e, [n]);
  return s.ok
    ? s.created > 0
      ? {
          ok: !0,
          action: "created",
          file: s.file,
          rotated: s.rotated || void 0,
          total: s.total,
          record: s.records?.[0] || n,
        }
      : {
          ok: !0,
          action: "skipped",
          file: s.file,
          total: s.total,
          record: n,
          reason: "duplicate",
        }
    : { ok: !1, reason: s.errors?.[0] || "batch_failed" };
}
export async function pushJsonToGithub(t, e, n, s) {
  let i = [];
  try {
    const l = JSON.parse(n);
    i = Array.isArray(l) ? l : [];
  } catch {
    throw new Error("pushJsonToGithub: content bukan JSON array");
  }
  const c = Buffer.byteLength(n, "utf8");
  if (c > 85e4)
    throw new Error(
      `File terlalu besar (${c} byte). Pakai upsertVideoToGithub agar di-chunk.`,
    );
  return T(t, e, i, s, !0);
}

/* ---------- Safe concurrent writes (409 fix) ----------
 * Bursts of Telegram uploads can write the same feed file at once. A 409/sha conflict used to
 * resend the stale merged content with the new sha, silently dropping the other writer's videos.
 * Now: a best-effort KV lock per file (existing ANALYTICS_KV binding), and on conflict the whole
 * batch is re-read, re-deduped and re-merged, up to 5 attempts with jittered backoff.
 */
const LOCK_PREFIX = "bot:lock:";
const LOCK_TTL_S = 60; // KV minimum TTL
const LOCK_WAIT_MS = 20_000;
const MAX_ATTEMPTS = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (attempt) => 400 * 2 ** attempt + Math.floor(Math.random() * 600);

async function kv() {
  try {
    const m = await import("@/lib/owner-analytics-shared");
    return { get: m.optionalKvGet, put: m.optionalKvPut };
  } catch {
    return null;
  }
}

async function acquireLock(fileName) {
  const k = await kv();
  if (!k) return null;
  const key = LOCK_PREFIX + fileName;
  const me = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const until = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < until) {
    const cur = await k.get(key);
    let held = !1;
    if (cur) {
      const at = Number(String(cur).split("-")[0]) || 0;
      held = Date.now() - at < LOCK_TTL_S * 1000;
    }
    if (!held) {
      await k.put(key, me, LOCK_TTL_S);
      await sleep(150);
      // KV is eventually consistent: this is a best-effort guard; the 409 re-merge is the real safety.
      if ((await k.get(key)) === me) return { key, me, k };
    }
    await sleep(500 + Math.floor(Math.random() * 500));
  }
  return null; // proceed without the lock; conflicts are still re-merged
}

async function releaseLock(lock) {
  if (!lock) return;
  try {
    if ((await lock.k.get(lock.key)) === lock.me) await lock.k.put(lock.key, "0-free", LOCK_TTL_S);
  } catch {
    /* expires anyway */
  }
}

export async function upsertVideosBatch(t, e, n) {
  const file = V(e);
  const lock = await acquireLock(file);
  try {
    let last = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await upsertVideosBatchOnce(t, e, n);
      } catch (err) {
        if (!(err && err.conflict)) throw err;
        last = err;
        await sleep(jitter(attempt));
      }
    }
    return {
      ok: !1,
      created: 0,
      skipped: 0,
      updated: 0,
      file,
      total: 0,
      errors: [`conflict after ${MAX_ATTEMPTS} attempts: ${last?.message || ""}`],
    };
  } finally {
    await releaseLock(lock);
  }
}
