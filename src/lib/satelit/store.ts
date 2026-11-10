/**
 * owner:satelit:v1 in the analytics KV the site already has.
 * Every function here writes only when the owner saves, uploads, or asks to sync.
 */
import { resolveAnalyticsKV } from "@/lib/analytics-kv";
import { hideOwnerMany } from "@/lib/catalog/owner-hide-store";
import {
  KV_KEY,
  type SatelliteHost,
  type SatelitState,
  type SiteSelection,
  cleanFolderUrl,
  cleanSpots,
  defaultState,
  invalidSpotKeys,
  normalizeState,
  uploadMarks,
} from "@/lib/satelit/config";

const ID_RE = /^[A-Za-z0-9_-]{3,64}$/;

async function kvPut(state: SatelitState): Promise<SatelitState> {
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  const next = normalizeState({ ...state, updatedAt: Date.now() });
  await r.kv.put(KV_KEY, JSON.stringify(next));
  return next;
}

export async function readSatelitState(): Promise<SatelitState> {
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  const raw = await r.kv.get(KV_KEY);
  if (!raw) return defaultState();
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

export async function saveSatellite(
  host: SatelliteHost,
  patch: { sync?: unknown; folderUrl?: unknown; spots?: unknown },
): Promise<SatelitState> {
  const state = await readSatelitState();
  const site = state.sites[host];
  if (typeof patch.sync === "boolean") site.sync = patch.sync;
  if (host === "videqsss.icu" && patch.folderUrl !== undefined) {
    const folder = cleanFolderUrl(patch.folderUrl);
    if (folder === null) throw new Error("bad_folder");
    site.folderUrl = folder;
  }
  if (patch.spots !== undefined) {
    if (invalidSpotKeys(patch.spots).length) throw new Error("bad_spot");
    site.spots = cleanSpots(patch.spots);
  }
  return kvPut(state);
}

/** show=true clears both lists so the video stays on this satellite and the others are untouched. */
export async function setSatelliteVideo(host: SatelliteHost, id: string, show: boolean, title = ""): Promise<SatelitState> {
  if (!ID_RE.test(id)) throw new Error("bad_id");
  const state = await readSatelitState();
  const site = state.sites[host];
  if (show) {
    delete site.hidden[id];
    delete site.exclude[id];
  } else {
    const kept = String(title || site.hidden[id]?.title || site.exclude[id]?.title || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    site.hidden[id] = { at: Date.now(), ...(kept ? { title: kept } : {}) };
    delete site.exclude[id];
  }
  return kvPut(state);
}

export async function markSyncRequest(host: SatelliteHost, lastSyncAt: number | null): Promise<SatelitState> {
  const state = await readSatelitState();
  const site = state.sites[host];
  site.syncRequestedAt = Date.now();
  if (lastSyncAt && lastSyncAt > 0) site.lastSyncAt = lastSyncAt;
  return kvPut(state);
}

/**
 * Records upload destinations. Unchecked satellites go on that site's exclude list
 * only. Unchecking koleksidrpinguin.com uses the existing main-site hide list
 * (one extra KV write) so the video can still sync to a satellite.
 */
export async function applyUploadSites(
  items: { id: string; title?: string; host?: string }[],
  selection: SiteSelection,
): Promise<{ hiddenOnMain: number; videqsss: number }> {
  const marks = uploadMarks(items, selection);
  if (!marks.length) return { hiddenOnMain: 0, videqsss: 0 };
  const state = await readSatelitState();
  const now = Date.now();
  const mainHide: string[] = [];
  for (const mark of marks) {
    for (const host of mark.exclude) {
      const prev = state.sites[host].exclude[mark.id];
      const title = mark.title || prev?.title || "";
      state.sites[host].exclude[mark.id] = { at: now, ...(title ? { title } : {}) };
    }
    for (const host of ["videyy.icu", "videqsss.icu"] as const) {
      if (!mark.exclude.includes(host)) delete state.sites[host].exclude[mark.id];
    }
    if (mark.hideOnMain) mainHide.push(mark.id);
  }
  await kvPut(state);
  if (mainHide.length) await hideOwnerMany(mainHide);
  return {
    hiddenOnMain: mainHide.length,
    videqsss: marks.filter((mark) => !mark.exclude.includes("videqsss.icu")).length,
  };
}
