/**
 * "Sync sekarang" without a new Worker env var.
 * 1. repository_dispatch on fashfdhgacd/vidy using the GitHub token the bot already has.
 * 2. Otherwise POST https://<host>/api/satelit/sync (no secret). A 404 is expected until
 *    that worker grows the route.
 * Either way the owner save records syncRequestedAt in the public config, which the
 * daily sync reads.
 */
import type { SatelliteHost } from "@/lib/satelit/config";

export type SyncTrigger = {
  triggered: boolean;
  via: "github" | "http" | "config";
  detail: string;
  lastSyncAt: number | null;
};

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function githubToken(env: Record<string, string | undefined>): string {
  return String(env.GITHUB_TOKEN || env.GH_TOKEN || "")
    .trim()
    .replace(/^GH_(?:TOKEN|OWNER|REPO|BRANCH)\s*=\s*/i, "")
    .trim();
}

export async function triggerSatelliteSync(
  host: SatelliteHost,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<SyncTrigger> {
  const token = githubToken(env);
  if (token) {
    try {
      const res = await fetchImpl("https://api.github.com/repos/fashfdhgacd/vidy/dispatches", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "kdp-satelit",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_type: "satelit-sync", client_payload: { host } }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 204) {
        return {
          triggered: true,
          via: "github",
          detail:
            "Sinyal sync terkirim ke repo satelit. Workflow hanya berjalan jika mendengar event satelit-sync. Permintaan juga tercatat di config.",
          lastSyncAt: null,
        };
      }
    } catch {
      /* fall through to the site itself */
    }
  }

  try {
    const res = await fetchImpl(`https://${host}/api/satelit/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "kdp-satelit" },
      body: JSON.stringify({ host }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { at?: unknown } | null;
      const at = Date.parse(String(body?.at || ""));
      return {
        triggered: true,
        via: "http",
        detail: "Satelit membalas sync.",
        lastSyncAt: Number.isFinite(at) && at > 0 ? at : Date.now(),
      };
    }
  } catch {
    /* the daily reader still sees syncRequestedAt */
  }

  return {
    triggered: false,
    via: "config",
    detail: "Permintaan disimpan di config. Sync harian satelit akan membacanya. Pemicu langsung tidak menjawab.",
    lastSyncAt: null,
  };
}
