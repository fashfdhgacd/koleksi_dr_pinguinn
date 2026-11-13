/**
 * Settings for the satellite sites videyy.icu and videqsss.icu.
 * KV key owner:satelit:v1 is written only when the owner saves (no per-visit writes).
 * Satellites read the public shape once a day from GET /api/satelit/config.json.
 *
 * A catalog id is shown on a satellite when it is not in blockedIds and not in
 * that site's skipIds. blockedIds is owner:catalog-block:v1 and applies on every
 * site, including koleksidrpinguin.com. sync:false means "skip the daily pull",
 * not "hide the videos". videqsss.icu folder.url is imported whole on the first
 * sync only; later syncs follow skipIds.
 */

export const CONFIG_PATH = "/api/satelit/config.json";
export const CONFIG_URL = "https://koleksidrpinguin.com/api/satelit/config.json";
export const CONFIG_VERSION = 1;
export const KV_KEY = "owner:satelit:v1";
export const CATALOG_BLOCK_KEY = "owner:catalog-block:v1";
/** Edge + browser cache for the public JSON. Owner saves also drop the edge copy. */
export const CONFIG_CACHE = "public, max-age=60, s-maxage=120";

export const MAIN_SITE = "koleksidrpinguin.com";
export const SATELLITE_HOSTS = ["videyy.icu", "videqsss.icu"] as const;
export type SatelliteHost = (typeof SATELLITE_HOSTS)[number];
export type PanelSite = "semua" | typeof MAIN_SITE | SatelliteHost;

export const PANEL_SITES: { id: PanelSite; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: MAIN_SITE, label: MAIN_SITE },
  { id: "videyy.icu", label: "videyy.icu" },
  { id: "videqsss.icu", label: "videqsss.icu" },
];

/** Old TrafficStars site ids (both sites were rejected, Nov 13 2026). Kept for reference only. */
export const TRAFFICSTARS_SITE_ID: Record<SatelliteHost, number> = {
  "videyy.icu": 92720,
  "videqsss.icu": 92721,
};

/** ExoClick publisher sites (verified Nov 13 2026) and their popunder zones. */
export const EXOCLICK_SITE: Record<SatelliteHost, { siteId: number; name: string; popunderZone: string }> = {
  "videyy.icu": { siteId: 1119546, name: "Videy Hub", popunderZone: "6088480" },
  "videqsss.icu": { siteId: 1119548, name: "Videqsss", popunderZone: "6088490" },
};

/** Saved zone ids, with the verified ExoClick popunder zone when the owner left it empty. */
export function effectiveSpots(host: SatelliteHost, spots: Record<SpotKey, string>): Record<SpotKey, string> {
  return { ...spots, popunder: spots.popunder || EXOCLICK_SITE[host].popunderZone };
}

/** Same caps as the main site (page-pop-cap.ts PAGE_POP_MAX_PER_DAY, card-popunder.ts POP_MAX_VIDEY). */
export const PAGE_POPUNDER_MAX_PER_DAY = 3;
export const VIDEY_SKIP_POPUNDER_MAX_PER_VIDEO = 3;

export const SPOT_KEYS = ["popunder", "preroll", "inpagePush", "videoSlider", "native300x250", "banner300x100"] as const;
export type SpotKey = (typeof SPOT_KEYS)[number];

export const SPOT_FIELDS: { key: SpotKey; label: string }[] = [
  { key: "popunder", label: "Popunder" },
  { key: "preroll", label: "Video pre-roll" },
  { key: "inpagePush", label: "In-page push" },
  { key: "videoSlider", label: "Video slider" },
  { key: "native300x250", label: "300x250 / native master" },
  { key: "banner300x100", label: "300x100" },
];

export const AD_RULES_LABEL =
  "Popunder halaman dan kartu maksimal 3 kali per pengunjung per hari. Popunder skip pemutar Videy maksimal 3 kali per video. Tidak pernah di IndoAV.";

const ID_RE = /^[A-Za-z0-9_-]{3,64}$/;
const SPOT_RE = /^\d{1,12}$/;

export type IdMark = { at: number; title?: string };

export type SiteSettings = {
  sync: boolean;
  folderUrl: string;
  spots: Record<SpotKey, string>;
  hidden: Record<string, IdMark>;
  exclude: Record<string, IdMark>;
  syncRequestedAt: number | null;
  lastSyncAt: number | null;
};

export type SatelitState = {
  v: 1;
  updatedAt: number;
  sites: Record<SatelliteHost, SiteSettings>;
};

export type SiteSelection = {
  main: boolean;
  videyy: boolean;
  videqsss: boolean;
};

export function emptySpots(): Record<SpotKey, string> {
  return {
    popunder: "",
    preroll: "",
    inpagePush: "",
    videoSlider: "",
    native300x250: "",
    banner300x100: "",
  };
}

export function emptySite(): SiteSettings {
  return {
    sync: true,
    folderUrl: "",
    spots: emptySpots(),
    hidden: {},
    exclude: {},
    syncRequestedAt: null,
    lastSyncAt: null,
  };
}

export function defaultState(): SatelitState {
  return {
    v: 1,
    updatedAt: 0,
    sites: {
      "videyy.icu": emptySite(),
      "videqsss.icu": emptySite(),
    },
  };
}

export function isSatelliteHost(value: string): value is SatelliteHost {
  return (SATELLITE_HOSTS as readonly string[]).includes(value);
}

/** True when the pasted upload contains an IndoAV or UserBokep link. */
export function textHasIndoSource(text: string): boolean {
  return /indoav\.|userbokep\./i.test(text);
}

/** videqsss.icu upload checkbox applies only to these hosts. */
export function videqsssHostAllowed(host: string): boolean {
  return host === "indoav" || host === "userbokep";
}

export function defaultUploadSelection(): SiteSelection {
  return { main: true, videyy: true, videqsss: false };
}

/** null when the caller did not send a site list (Telegram bot keeps today's defaults). */
export function selectionFromHosts(raw: unknown): SiteSelection | null {
  if (!Array.isArray(raw)) return null;
  const set = new Set(raw.map((item) => String(item || "").trim().toLowerCase()));
  return {
    main: set.has(MAIN_SITE),
    videyy: set.has("videyy.icu"),
    videqsss: set.has("videqsss.icu"),
  };
}

export type UploadMark = {
  id: string;
  title: string;
  hideOnMain: boolean;
  exclude: SatelliteHost[];
};

/** Per new video: which satellites must skip it, and whether the main site hides it. */
export function uploadMarks(items: { id: string; title?: string; host?: string }[], selection: SiteSelection): UploadMark[] {
  const out: UploadMark[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const id = String(item.id || "").trim();
    if (!ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    const exclude: SatelliteHost[] = [];
    if (!selection.videyy) exclude.push("videyy.icu");
    if (!(selection.videqsss && videqsssHostAllowed(String(item.host || "")))) exclude.push("videqsss.icu");
    out.push({
      id,
      title: cleanTitle(item.title),
      hideOnMain: !selection.main,
      exclude,
    });
  }
  return out;
}

function cleanTitle(raw: unknown): string {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function cleanMarks(raw: unknown): Record<string, IdMark> {
  const out: Record<string, IdMark> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ID_RE.test(id)) continue;
    const at = Number((value as { at?: unknown })?.at) || 0;
    const title = cleanTitle((value as { title?: unknown })?.title);
    out[id] = title ? { at, title } : { at };
  }
  return out;
}

export function cleanSpots(raw: unknown): Record<SpotKey, string> {
  const spots = emptySpots();
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const key of SPOT_KEYS) {
    const value = String(src[key] ?? "").trim();
    spots[key] = SPOT_RE.test(value) ? value : "";
  }
  return spots;
}

/** "" clears the folder. null means the value is not a usable https URL. */
export function cleanFolderUrl(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (value.length > 500) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  return url.toString();
}

function positiveMs(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanSite(raw: unknown, host: SatelliteHost): SiteSettings {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const folder = host === "videqsss.icu" ? cleanFolderUrl(src.folderUrl) : "";
  return {
    sync: src.sync !== false,
    folderUrl: folder === null ? "" : folder,
    spots: cleanSpots(src.spots),
    hidden: cleanMarks(src.hidden),
    exclude: cleanMarks(src.exclude),
    syncRequestedAt: positiveMs(src.syncRequestedAt),
    lastSyncAt: positiveMs(src.lastSyncAt),
  };
}

export function normalizeState(raw: unknown): SatelitState {
  const src = raw && typeof raw === "object" ? (raw as { sites?: Record<string, unknown>; updatedAt?: unknown }) : {};
  const sites = src.sites || {};
  return {
    v: 1,
    updatedAt: positiveMs(src.updatedAt) || 0,
    sites: {
      "videyy.icu": cleanSite(sites["videyy.icu"], "videyy.icu"),
      "videqsss.icu": cleanSite(sites["videqsss.icu"], "videqsss.icu"),
    },
  };
}

export function iso(ms: number | null | undefined): string | null {
  if (!ms) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function sortedIds(map: Record<string, IdMark>): string[] {
  return Object.keys(map).sort((a, b) => a.localeCompare(b));
}

function unionIds(site: SiteSettings): string[] {
  return [...new Set([...Object.keys(site.hidden), ...Object.keys(site.exclude)])].sort((a, b) => a.localeCompare(b));
}

export type PublicSite = {
  host: SatelliteHost;
  sync: boolean;
  adNetwork: "exoclick";
  exoclickSiteId: number;
  approval: "active";
  spots: Record<SpotKey, string>;
  hiddenIds: string[];
  uploadExcludeIds: string[];
  skipIds: string[];
  syncRequestedAt: string | null;
  lastSyncAt: string | null;
  folder?: { url: string; import: "first-sync-whole-folder" };
};

export type PublicConfig = {
  ok: true;
  version: typeof CONFIG_VERSION;
  endpoint: string;
  updatedAt: string | null;
  rules: {
    catalogBlockKey: typeof CATALOG_BLOCK_KEY;
    catalogBlockAppliesEverywhere: true;
    pagePopunderMaxPerVisitorPerDay: number;
    videySkipPopunderMaxPerVideo: number;
    neverOnIndoav: true;
  };
  blockedIds: string[];
  sites: PublicSite[];
};

export function spotsApproval(spots: Record<SpotKey, string>): "pending" | "spots-set" {
  return SPOT_KEYS.some((key) => spots[key]) ? "spots-set" : "pending";
}

/** Stable public document. Satellites should filter with blockedIds and each site's skipIds. */
export function toPublicConfig(state: SatelitState, blockedIds: readonly string[]): PublicConfig {
  const blocked = [...new Set(blockedIds.filter((id) => ID_RE.test(id)))].sort((a, b) => a.localeCompare(b));
  return {
    ok: true,
    version: CONFIG_VERSION,
    endpoint: CONFIG_URL,
    updatedAt: iso(state.updatedAt),
    rules: {
      catalogBlockKey: CATALOG_BLOCK_KEY,
      catalogBlockAppliesEverywhere: true,
      pagePopunderMaxPerVisitorPerDay: PAGE_POPUNDER_MAX_PER_DAY,
      videySkipPopunderMaxPerVideo: VIDEY_SKIP_POPUNDER_MAX_PER_VIDEO,
      neverOnIndoav: true,
    },
    blockedIds: blocked,
    sites: SATELLITE_HOSTS.map((host) => {
      const site = state.sites[host];
      const row: PublicSite = {
        host,
        sync: site.sync,
        adNetwork: "exoclick",
        exoclickSiteId: EXOCLICK_SITE[host].siteId,
        approval: "active",
        spots: effectiveSpots(host, site.spots),
        hiddenIds: sortedIds(site.hidden),
        uploadExcludeIds: sortedIds(site.exclude),
        skipIds: unionIds(site),
        syncRequestedAt: iso(site.syncRequestedAt),
        lastSyncAt: iso(site.lastSyncAt),
      };
      if (host === "videqsss.icu") row.folder = { url: site.folderUrl, import: "first-sync-whole-folder" };
      return row;
    }),
  };
}

export function visibleOnSatellite(site: SiteSettings, id: string, blocked: ReadonlySet<string>): boolean {
  if (!ID_RE.test(id)) return false;
  if (blocked.has(id) || blocked.has(id.toLowerCase())) return false;
  return !site.hidden[id] && !site.exclude[id];
}

export type OwnerVideoRow = { id: string; title: string; at: number; reason: "hidden" | "upload" };

export function ownerSiteView(site: SiteSettings): {
  sync: boolean;
  folderUrl: string;
  spots: Record<SpotKey, string>;
  syncRequestedAt: string | null;
  lastSyncAt: string | null;
  videos: OwnerVideoRow[];
} {
  const rows = (map: Record<string, IdMark>, reason: OwnerVideoRow["reason"]) =>
    Object.entries(map).map(([id, mark]) => ({ id, title: mark.title || "", at: mark.at || 0, reason }));
  const byId = new Map<string, OwnerVideoRow>();
  for (const row of rows(site.exclude, "upload")) byId.set(row.id, row);
  for (const row of rows(site.hidden, "hidden")) byId.set(row.id, row);
  return {
    sync: site.sync,
    folderUrl: site.folderUrl,
    spots: { ...site.spots },
    syncRequestedAt: iso(site.syncRequestedAt),
    lastSyncAt: iso(site.lastSyncAt),
    videos: [...byId.values()].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)),
  };
}

export function invalidSpotKeys(raw: unknown): SpotKey[] {
  if (!raw || typeof raw !== "object") return [];
  const src = raw as Record<string, unknown>;
  return SPOT_KEYS.filter((key) => {
    const value = String(src[key] ?? "").trim();
    return value.length > 0 && !SPOT_RE.test(value);
  });
}
