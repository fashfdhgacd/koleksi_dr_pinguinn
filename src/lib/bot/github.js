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
