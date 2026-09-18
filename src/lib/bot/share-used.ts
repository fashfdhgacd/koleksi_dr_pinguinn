const SHARE_USED_PATH = "data/share-used.json";
const SHARE_USED_MAX = 4000;

export type ShareUsedFile = {
  resetAt: number;
  used: string[];
  titles?: string[];
  lastCat?: string;
  lastSource?: string;
  lastCount?: number;
};

function ghCfg() {
  const token = String(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
  const owner = String(process.env.GH_OWNER || process.env.GITHUB_OWNER || "fashfdhgacd").trim();
  let repo = String(process.env.GH_REPO || process.env.GITHUB_REPO || "koleksi_dr_pinguinn").trim();
  if (repo === "koleksi_dr_pinguin" || repo === "koleksi-dr-pinguin") repo = "koleksi_dr_pinguinn";
  const branch = String(process.env.GH_BRANCH || process.env.GITHUB_BRANCH || "main").trim();
  return { token, owner, repo, branch };
}

export async function loadShareUsed(): Promise<ShareUsedFile> {
  const { owner, repo, branch } = ghCfg();
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${SHARE_USED_PATH}?t=${Date.now()}`;
  try {
    const r = await fetch(url, { headers: { "user-agent": "kdp-share-bot" }, cache: "no-store" });
    if (!r.ok) return { resetAt: Date.now(), used: [], titles: [] };
    const d = (await r.json()) as ShareUsedFile;
    return {
      resetAt: Number(d.resetAt) || Date.now(),
      used: Array.isArray(d.used) ? d.used.map(String) : [],
      titles: Array.isArray(d.titles) ? d.titles.map(String) : [],
      lastCat: d.lastCat || "",
      lastSource: d.lastSource || "",
      lastCount: d.lastCount || 10,
    };
  } catch {
    return { resetAt: Date.now(), used: [], titles: [] };
  }
}

export async function saveShareUsed(file: ShareUsedFile): Promise<void> {
  const { token, owner, repo, branch } = ghCfg();
  if (!token) return;
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${SHARE_USED_PATH}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "kdp-share-bot",
    "Content-Type": "application/json",
  };
  let sha: string | undefined;
  try {
    const cur = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
    if (cur.ok) {
      const body = (await cur.json()) as { sha?: string };
      sha = body.sha;
    }
  } catch {
    /* create */
  }
  const used = file.used.slice(-SHARE_USED_MAX);
  const titles = (file.titles || []).slice(-SHARE_USED_MAX);
  const payload = {
    resetAt: file.resetAt,
    used,
    titles,
    lastCat: file.lastCat || "",
    lastSource: file.lastSource || "",
    lastCount: file.lastCount || 10,
  };
  const content = Buffer.from(JSON.stringify(payload, null, 2) + "\n", "utf8").toString("base64");
  await fetch(api, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `bot: share-used ${used.length}`,
      content,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
}
