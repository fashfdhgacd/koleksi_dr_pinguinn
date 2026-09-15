export async function pushJsonToGithub(env, relativePath, content) {
  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";
  const prefix = (env.GITHUB_DATA_PREFIX || "data").replace(/\/$/, "");
  if (!token || !owner || !repo) return { skipped: true };

  const pathName = `${prefix}/${relativePath}`.replace(/\/+/g, "/");
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${pathName}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "kdp-telegram-bot",
  };

  let sha;
  const existing = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  if (existing.ok) {
    const body = await existing.json();
    sha = body.sha;
  }

  const res = await fetch(api, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `bot: update ${relativePath}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      sha,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub ${res.status}: ${err.slice(0, 300)}`);
  }
  return { skipped: false, path: pathName };
}
