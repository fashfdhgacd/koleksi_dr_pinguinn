/**
 * "Sync sekarang" without a new Worker env var.
 * 1. workflow_dispatch of vidy "Videy catalog sync" (then repository_dispatch satelit-sync) with the
 *    GitHub token the bot already has (Worker secret GH_TOKEN, read from cloudflare:workers env).
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

/** Worker secrets live on the cloudflare:workers env; process.env is only a fallback (tests, node). */
async function workerEnv(): Promise<Record<string, string | undefined>> {
  try {
    const mod = (await import("cloudflare:workers")) as { env?: Record<string, unknown> };
    const out: Record<string, string | undefined> = {};
    for (const key of ["GITHUB_TOKEN", "GH_TOKEN"]) {
      const v = mod.env?.[key];
      if (typeof v === "string" && v) out[key] = v;
    }
    if (out.GITHUB_TOKEN || out.GH_TOKEN) return out;
  } catch {
    /* not on Workers */
  }
  return process.env as Record<string, string | undefined>;
}

const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "kdp-satelit",
  "Content-Type": "application/json",
});

export async function triggerSatelliteSync(
  host: SatelliteHost,
  env?: Record<string, string | undefined>,
  fetchImpl: FetchLike = fetch,
): Promise<SyncTrigger> {
  const token = githubToken(env ?? (await workerEnv()));
  if (token) {
    const attempts: Array<[string, unknown]> = [
      ["https://api.github.com/repos/fashfdhgacd/vidy/actions/workflows/videyy-catalog-sync.yml/dispatches", { ref: "main" }],
      ["https://api.github.com/repos/fashfdhgacd/vidy/dispatches", { event_type: "satelit-sync", client_payload: { host } }],
    ];
    for (const [url, body] of attempts) {
      try {
        const res = await fetchImpl(url, {
          method: "POST",
          headers: GH_HEADERS(token),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
        });
        if (res.status === 204) {
          return {
            triggered: true,
            via: "github",
            detail: "Sync satelit dimulai (GitHub Actions). Selesai ±1–3 menit, lalu situs deploy ulang.",
            lastSyncAt: null,
          };
        }
      } catch {
        /* next attempt */
      }
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
    detail: "Permintaan disimpan. Workflow satelit mengecek permintaan tiap 2 jam dan menjalankan sync.",
    lastSyncAt: null,
  };
}
