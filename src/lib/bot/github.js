/**
 * Read/write JSON in GitHub — handles files > 1MB (Contents API returns empty content).
 * Env: GH_TOKEN|GITHUB_TOKEN, GH_OWNER|GITHUB_OWNER, GH_REPO|GITHUB_REPO,
 *      GH_BRANCH|GITHUB_BRANCH, GH_DATA_PREFIX|GITHUB_DATA_PREFIX
 */

function cfg(env) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN || "";
  const owner = env.GITHUB_OWNER || env.GH_OWNER || "";
  const repo = env.GITHUB_REPO || env.GH_REPO || "";
  const branch = env.GITHUB_BRANCH || env.GH_BRANCH || "main";
  const prefix = (env.GITHUB_DATA_PREFIX || env.GH_DATA_PREFIX || "data").replace(
    /\/$/,
    ""
  );
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

function pathName(prefix, relativePath) {
  return `${prefix}/${relativePath}`.replace(/\/+/g, "/");
}

/** Baca array JSON dari repo (aman untuk file > 1MB). */
export async function fetchJsonFromGithub(env, relativePath) {
  const { token, owner, repo, branch, prefix } = cfg(env);
  if (!token || !owner || !repo) {
    return { ok: false, items: [], sha: null, reason: "missing_github_env" };
  }

  const p = pathName(prefix, relativePath);
  const metaUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(metaUrl, { headers: headers(token) });

  if (res.status === 404) {
    return { ok: true, items: [], sha: null, pathName: p };
  }
  if (!res.ok) {
    const err = await res.text();
    return {
      ok: false,
      items: [],
      sha: null,
      reason: `GitHub GET ${res.status}: ${err.slice(0, 200)}`,
    };
  }

  const body = await res.json();
  const sha = body.sha || null;
  let raw = "";

  if (body.encoding === "base64" && body.content) {
    raw = Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8");
  } else if (body.download_url) {
    const dl = await fetch(body.download_url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "kdp-telegram-bot",
        Accept: "application/vnd.github.raw",
      },
    });
    if (!dl.ok) {
      const dl2 = await fetch(body.download_url, {
        headers: { "User-Agent": "kdp-telegram-bot" },
      });
      if (!dl2.ok) {
        return {
          ok: false,
          items: [],
          sha,
          reason: `GitHub download ${dl.status}`,
        };
      }
      raw = await dl2.text();
    } else {
      raw = await dl.text();
    }
  } else if (body.git_url) {
    const blobRes = await fetch(body.git_url, { headers: headers(token) });
    if (!blobRes.ok) {
      return {
        ok: false,
        items: [],
        sha,
        reason: `GitHub blob ${blobRes.status}`,
      };
    }
    const blob = await blobRes.json();
    if (blob.encoding === "base64" && blob.content) {
      raw = Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString(
        "utf8"
      );
    }
  }

  let items = [];
  try {
    const data = JSON.parse(raw || "[]");
    items = Array.isArray(data) ? data : [];
  } catch {
    items = [];
  }
  return { ok: true, items, sha, pathName: p };
}

export async function pushJsonToGithub(env, relativePath, content, sha) {
  const { token, owner, repo, branch, prefix } = cfg(env);
  if (!token || !owner || !repo) return { skipped: true };

  const p = pathName(prefix, relativePath);
  const bytes = Buffer.byteLength(content, "utf8");

  if (bytes < 900_000) {
    return pushViaContentsApi({ token, owner, repo, branch, pathName: p, content, sha });
  }
  return pushViaGitDataApi({ token, owner, repo, branch, pathName: p, content });
}

async function pushViaContentsApi({ token, owner, repo, branch, pathName: p, content, sha }) {
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
    message: `bot: update ${p.split("/").pop()}`,
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
    if (res.status === 422 || res.status === 413 || /too large|size limit|1 MB|100 MB/i.test(err)) {
      return pushViaGitDataApi({ token, owner, repo, branch, pathName: p, content });
    }
    throw new Error(`GitHub ${res.status}: ${err.slice(0, 300)}`);
  }
  return { skipped: false, path: p, method: "contents" };
}

async function pushViaGitDataApi({ token, owner, repo, branch, pathName: p, content }) {
  const h = headers(token);
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  const refRes = await fetch(`${base}/git/ref/heads/${encodeURIComponent(branch)}`, {
    headers: h,
  });
  if (!refRes.ok) {
    const err = await refRes.text();
    throw new Error(`GitHub ref ${refRes.status}: ${err.slice(0, 200)}`);
  }
  const ref = await refRes.json();
  const parentSha = ref.object.sha;

  const commitRes = await fetch(`${base}/git/commits/${parentSha}`, { headers: h });
  if (!commitRes.ok) {
    const err = await commitRes.text();
    throw new Error(`GitHub commit ${commitRes.status}: ${err.slice(0, 200)}`);
  }
  const parentCommit = await commitRes.json();
  const baseTree = parentCommit.tree.sha;

  const blobRes = await fetch(`${base}/git/blobs`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ content, encoding: "utf-8" }),
  });
  if (!blobRes.ok) {
    const err = await blobRes.text();
    throw new Error(`GitHub blob ${blobRes.status}: ${err.slice(0, 200)}`);
  }
  const blob = await blobRes.json();

  const treeRes = await fetch(`${base}/git/trees`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({
      base_tree: baseTree,
      tree: [
        {
          path: p,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        },
      ],
    }),
  });
  if (!treeRes.ok) {
    const err = await treeRes.text();
    throw new Error(`GitHub tree ${treeRes.status}: ${err.slice(0, 200)}`);
  }
  const tree = await treeRes.json();

  const newCommitRes = await fetch(`${base}/git/commits`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `bot: update ${p.split("/").pop()}`,
      tree: tree.sha,
      parents: [parentSha],
    }),
  });
  if (!newCommitRes.ok) {
    const err = await newCommitRes.text();
    throw new Error(`GitHub new-commit ${newCommitRes.status}: ${err.slice(0, 200)}`);
  }
  const newCommit = await newCommitRes.json();

  const updateRef = await fetch(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ sha: newCommit.sha }),
  });
  if (!updateRef.ok) {
    const err = await updateRef.text();
    throw new Error(`GitHub update-ref ${updateRef.status}: ${err.slice(0, 200)}`);
  }

  return { skipped: false, path: p, method: "git-data" };
}
