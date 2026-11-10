import { createFileRoute } from "@tanstack/react-router";
import { isOwnerRequest } from "@/lib/owner-auth";
import {
  AD_RULES_LABEL,
  SATELLITE_HOSTS,
  TRAFFICSTARS_SITE_ID,
  isSatelliteHost,
  ownerSiteView,
} from "@/lib/satelit/config";

/**
 * Owner-only satellite settings (header x-online-key). One KV write per save / video toggle / sync.
 * The public copy is /api/satelit/config.json. purgeConfig tells the Worker entry to drop that cache.
 */
function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

async function snapshot() {
  const { readSatelitState } = await import("@/lib/satelit/store");
  const state = await readSatelitState();
  return {
    ok: true,
    rules: AD_RULES_LABEL,
    sites: SATELLITE_HOSTS.map((host) => ({
      host,
      trafficstarsSiteId: TRAFFICSTARS_SITE_ID[host],
      ...ownerSiteView(state.sites[host]),
    })),
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
          if (msg === "bad_spot") return json({ ok: false, error: "Spot ID TrafficStars hanya angka." }, 400);
          if (msg === "bad_id") return json({ ok: false, error: "ID video tidak valid." }, 400);
          return json({ ok: false, error: msg === "kv_unavailable" ? "Penyimpanan KV tidak tersedia." : msg.slice(0, 160) }, 503);
        }
      },
    },
  },
});
