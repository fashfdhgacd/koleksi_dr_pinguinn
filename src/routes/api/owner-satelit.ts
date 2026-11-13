import { createFileRoute } from "@tanstack/react-router";
import { isOwnerRequest } from "@/lib/owner-auth";
import {
  AD_RULES_LABEL,
  SATELLITE_HOSTS,
  EXOCLICK_SITE,
  effectiveSpots,
  isSatelliteHost,
  type SatelliteHost,
  ownerSiteView,
} from "@/lib/satelit/config";

/**
 * Owner-only satellite settings (header x-online-key). One KV write per save / video toggle / sync.
 * The public copy is /api/satelit/config.json. purgeConfig tells the Worker entry to drop that cache.
 */
function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

type SyncStatus = {
  syncedAt: string | null;
  trigger: string | null;
  added: number | null;
  upstream: number | null;
  ok: boolean | null;
  runUrl: string | null;
};

/**
 * What the satellite itself reports: /sync-status.json (static asset written by the vidy sync job)
 * and its catalog total (/api/data, edge cached). Owner-only GET, two small fetches, no KV.
 */
async function liveStatus(host: SatelliteHost): Promise<{ status: SyncStatus | null; liveCount: number | null }> {
  const get = async (path: string) => {
    try {
      const res = await fetch(`https://${host}${path}`, {
        headers: { accept: "application/json", "user-agent": "kdp-satelit" },
        signal: AbortSignal.timeout(4000),
      });
      return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const [st, data] = await Promise.all([
    get(`/sync-status.json?t=${Math.floor(Date.now() / 60000)}`),
    get("/api/data?type=latest&page=1&limit=1"),
  ]);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const status: SyncStatus | null =
    st && typeof st.syncedAt === "string"
      ? {
          syncedAt: st.syncedAt,
          trigger: typeof st.trigger === "string" ? st.trigger : null,
          added: num(st.added),
          upstream: num(st.upstream),
          ok: typeof st.ok === "boolean" ? st.ok : null,
          runUrl: typeof st.runUrl === "string" ? st.runUrl : null,
        }
      : null;
  return { status, liveCount: num(data?.total) };
}

const later = (a: string | null, b: string | null): string | null =>
  !a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b;

async function snapshot() {
  const { readSatelitState } = await import("@/lib/satelit/store");
  const state = await readSatelitState();
  const live = await Promise.all(SATELLITE_HOSTS.map((host) => liveStatus(host)));
  return {
    ok: true,
    rules: AD_RULES_LABEL,
    sites: SATELLITE_HOSTS.map((host, i) => {
      const view = ownerSiteView(state.sites[host]);
      const { status, liveCount } = live[i];
      return {
        host,
        adNetwork: "exoclick" as const,
        exoclickSiteId: EXOCLICK_SITE[host].siteId,
        exoclickName: EXOCLICK_SITE[host].name,
        adStatus: "active" as const,
        ...view,
        spots: effectiveSpots(host, view.spots),
        lastSyncAt: later(view.lastSyncAt, status?.syncedAt ?? null),
        lastSync: status,
        liveCount,
      };
    }),
  };
}

export const Route = createFileRoute("/api/owner-satelit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isOwnerRequest(request))) return json({ ok: false, error: "forbidden" }, 403);
        try {
          return json(await snapshot());
        } catch (err) {
          const msg = String((err as Error)?.message || err);
          return json({ ok: false, error: msg === "kv_unavailable" ? "Penyimpanan KV tidak tersedia." : msg.slice(0, 160) }, 503);
        }
      },
      POST: async ({ request }) => {
        if (!(await isOwnerRequest(request))) return json({ ok: false, error: "forbidden" }, 403);
        let body: { action?: string; host?: string; sync?: unknown; folderUrl?: unknown; spots?: unknown; id?: unknown; show?: unknown; title?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ ok: false, error: "bad_json" }, 400);
        }
        const host = String(body.host || "");
        if (!isSatelliteHost(host)) return json({ ok: false, error: "Situs tidak dikenal." }, 400);
        try {
          const store = await import("@/lib/satelit/store");
          if (body.action === "save") {
            await store.saveSatellite(host, { sync: body.sync, folderUrl: body.folderUrl, spots: body.spots });
          } else if (body.action === "video") {
            await store.setSatelliteVideo(host, String(body.id || ""), body.show === true, String(body.title || ""));
          } else if (body.action === "sync") {
            await store.saveSatellite(host, { sync: body.sync, folderUrl: body.folderUrl, spots: body.spots });
            const { triggerSatelliteSync } = await import("@/lib/satelit/sync");
            const trigger = await triggerSatelliteSync(host);
            await store.markSyncRequest(host, trigger.lastSyncAt);
            const snap = await snapshot();
            return json({ ...snap, purgeConfig: true, detail: trigger.detail, triggered: trigger.triggered });
          } else {
            return json({ ok: false, error: "bad_action" }, 400);
          }
          const snap = await snapshot();
          return json({ ...snap, purgeConfig: true });
        } catch (err) {
          const msg = String((err as Error)?.message || err);
          if (msg === "bad_folder") return json({ ok: false, error: "Tautan folder harus https, tanpa kata sandi di URL." }, 400);
          if (msg === "bad_spot") return json({ ok: false, error: "Zone ID ExoClick hanya angka." }, 400);
          if (msg === "bad_id") return json({ ok: false, error: "ID video tidak valid." }, 400);
          return json({ ok: false, error: msg === "kv_unavailable" ? "Penyimpanan KV tidak tersedia." : msg.slice(0, 160) }, 503);
        }
      },
    },
  },
});
