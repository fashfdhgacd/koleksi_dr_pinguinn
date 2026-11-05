/**
 * Live catalog blocklist in the moderation KV the site already uses (ANALYTICS_KV),
 * key "owner:catalog-block:v1". Writes happen only from the owner delete action.
 * Reads overlay this isolate's recent writes so a stale edge cache cannot drop an id
 * that was just removed. No write on a normal visit.
 */
import { resolveAnalyticsKV } from "@/lib/analytics-kv";
import { BLOCK_ID_RE, normalizeBlockState } from "@/lib/catalog/catalog-block.js";

export type CatalogBlockEntry = { at: number; title?: string };
export type CatalogBlockState = { ids: Record<string, CatalogBlockEntry> };

const KEY = "owner:catalog-block:v1";
const JOURNAL_MS = 120_000;
const journal = new Map<string, CatalogBlockEntry>();

function withJournal(state: CatalogBlockState): CatalogBlockState {
  const now = Date.now();
  for (const [id, j] of journal) {
    if (now - j.at > JOURNAL_MS) {
      journal.delete(id);
      continue;
    }
    const cur = state.ids[id];
    const title = j.title || cur?.title || "";
    if (!cur || j.at >= (cur.at || 0)) state.ids[id] = { at: j.at, ...(title ? { title } : {}) };
    else if (title && !cur.title) state.ids[id] = { ...cur, title };
  }
  return state;
}

/** Reads the blocklist. Throws when KV is not reachable (caller keeps the previous list). */
export async function readCatalogBlockState(): Promise<CatalogBlockState> {
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  const raw = await r.kv.get(KEY);
  if (!raw) return withJournal({ ids: {} });
  try {
    return withJournal(normalizeBlockState(JSON.parse(raw)));
  } catch {
    return withJournal({ ids: {} });
  }
}

/** Adds one id, with the title shown later in the owner removal report. Does not accept a list. */
export async function addCatalogBlocked(id: string, title = ""): Promise<CatalogBlockState> {
  if (!BLOCK_ID_RE.test(id)) throw new Error("bad_id");
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  const state = await readCatalogBlockState();
  const at = Date.now();
  const kept = String(title || state.ids[id]?.title || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const entry: CatalogBlockEntry = { at, ...(kept ? { title: kept } : {}) };
  state.ids[id] = entry;
  await r.kv.put(KEY, JSON.stringify(normalizeBlockState(state)));
  journal.set(id, entry);
  return state;
}

function ghToken(): string {
  return String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "")
    .trim()
    .replace(/^GH_(?:TOKEN|OWNER|REPO|BRANCH)\s*=\s*/i, "")
    .trim();
}

/**
 * Mirrors the KV list into src/lib/catalog/catalog-blocklist.json so the next build
 * and GitHub Actions sync (which cannot read KV) skip the same ids. Uses the GitHub
 * token the bot already has. Missing token → skipped, KV still holds the id.
 */
export async function commitCatalogBlock(state: CatalogBlockState, id: string): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const token = ghToken();
  if (!token) return { ok: true, skipped: true };
  const owner = String(process.env.GITHUB_OWNER || process.env.GH_OWNER || "fashfdhgacd").trim() || "fashfdhgacd";
  let repo = String(process.env.GITHUB_REPO || process.env.GH_REPO || "koleksi_dr_pinguinn").trim() || "koleksi_dr_pinguinn";
  if (repo === "koleksi_dr_pinguin" || repo === "koleksi-dr-pinguin") repo = "koleksi_dr_pinguinn";
  const branch = String(process.env.GITHUB_BRANCH || process.env.GH_BRANCH || "main").trim() || "main";
  const path = "src/lib/catalog/catalog-blocklist.json";
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "kdp-catalog-block",
  };
  let sha = "";
  let remote = normalizeBlockState({});
  try {
    const cur = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
    if (cur.ok) {
      const body = (await cur.json()) as { sha?: string; content?: string };
      sha = String(body.sha || "");
      try {
        const text = Buffer.from(String(body.content || "").replace(/\n/g, ""), "base64").toString("utf8");
        remote = normalizeBlockState(JSON.parse(text || "{}"));
      } catch {
        remote = normalizeBlockState({});
      }
    } else if (cur.status !== 404) {
      return { ok: false, error: `github_${cur.status}` };
    }
    const ids = { ...remote.ids, ...normalizeBlockState(state).ids };
    const content = Buffer.from(`${JSON.stringify({ ids }, null, 2)}\n`, "utf8").toString("base64");
    const res = await fetch(api, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `chore(catalog): remove ${id} from the catalog`,
        content,
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!res.ok) return { ok: false, error: `github_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err).slice(0, 160) };
  }
}
