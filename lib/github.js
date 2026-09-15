/**
 * Read/write JSON files in a GitHub repo (for serverless persistence).
 * Env: GITHUB_TOKEN (or GH_TOKEN), GITHUB_OWNER (or GH_OWNER),
 *      GITHUB_REPO (or GH_REPO), GITHUB_BRANCH, GITHUB_DATA_PREFIX
 */

function cfg(env) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN || "";
  const owner = env.GITHUB_OWNER || env.GH_OWNER || "";
  const repo = env.GITHUB_REPO || env.GH_REPO || "";
  const branch = env.GITHUB_BRANCH || env.GH_BRANCH || "main";
  const prefix = (env.GITHUB_DATA_PREFIX || env.GH_DATA_PREFIX || "data").replace(/\/$/, "");
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

export async function fetchJsonFromGithub(env, relativePath) {
  const { token, owner, repo, branch, prefix } = cfg(env);
  if (!token || !owner || !repo) return { ok: false, items: [], sha: null, reason: "missing_github_env" };

  const pathName = `${prefix}/${relativePath}`.replace(/\/+/g, "/");
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${pathName}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(api, { headers: headers(token) });
  if (res.status === 404) return { ok: true, items: [], sha: null, pathName };
  if (!res.ok) {
    const err = await res.text();
    return { ok: false, items: [], sha: null, reason: `GitHub GET ${res.status}: ${err.slice(0, 200)}` };
  }
  const body = await res.json();
  const raw = Buffer.from(body.content || "", "base64").toString("utf8");
  let items = [];
  try {
    const data = JSON.parse(raw);
    items = Array.isArray(data) ? data : [];
  } catch {
    items = [];
  }
  return { ok: true, items, sha: body.sha, pathName };
}

export async function pushJsonToGithub(env, relativePath, content, sha) {
  const { token, owner, repo, branch, prefix } = cfg(env);
  if (!token || !owner || !repo) return { skipped: true };

  const pathName = `${prefix}/${relativePath}`.replace(/\/+/g, "/");
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${pathName}`;

  let currentSha = sha;
  if (!currentSha) {
    const existing = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: headers(token) });
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
    throw new Error(`GitHub ${res.status}: ${err.slice(0, 300)}`);
  }
  return { skipped: false, path: pathName };
}
