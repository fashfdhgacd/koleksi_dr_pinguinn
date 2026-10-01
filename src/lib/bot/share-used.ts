import { resolveAnalyticsKV } from "@/lib/analytics-kv";

const SHARE_USED_KEY = "bot:share-used";
const SHARE_USED_MAX = 8000;
const SHARE_USED_TTL_SEC = 14 * 24 * 3600;

export type ShareUsedFile = {
  resetAt: number;
  used: string[];
  titles?: string[];
  lastCat?: string;
  lastSource?: string;
  lastCount?: number;
};

function emptyUsed(): ShareUsedFile {
  return { resetAt: Date.now(), used: [], titles: [], lastCat: "", lastSource: "", lastCount: 10 };
}

/** Cache RAM per instance — cegah ulang sebelum KV sempat tersimpan. */
let mem: ShareUsedFile | null = null;

function mergeUsed(a: ShareUsedFile, b: ShareUsedFile): ShareUsedFile {
  const used = Array.from(new Set([...(a.used || []), ...(b.used || [])].map(String)));
  const titles = Array.from(new Set([...(a.titles || []), ...(b.titles || [])].map(String)));
  return {
    resetAt: Math.max(Number(a.resetAt) || 0, Number(b.resetAt) || 0) || Date.now(),
    used,
    titles,
    lastCat: b.lastCat || a.lastCat || "",
    lastSource: b.lastSource || a.lastSource || "",
    lastCount: b.lastCount || a.lastCount || 10,
  };
}

function trim(file: ShareUsedFile): ShareUsedFile {
  return {
    resetAt: file.resetAt || Date.now(),
    used: (file.used || []).map(String).slice(-SHARE_USED_MAX),
    titles: (file.titles || []).map(String).slice(-SHARE_USED_MAX),
    lastCat: file.lastCat || "",
    lastSource: file.lastSource || "",
    lastCount: file.lastCount || 10,
  };
}

export async function loadShareUsed(): Promise<ShareUsedFile> {
  let remote = emptyUsed();
  try {
    const handle = await resolveAnalyticsKV();
    const raw = handle?.kv ? await handle.kv.get(SHARE_USED_KEY) : null;
    if (raw) {
      const d = JSON.parse(raw) as ShareUsedFile;
      remote = {
        resetAt: Number(d.resetAt) || Date.now(),
        used: Array.isArray(d.used) ? d.used.map(String) : [],
        titles: Array.isArray(d.titles) ? d.titles.map(String) : [],
        lastCat: d.lastCat || "",
        lastSource: d.lastSource || "",
        lastCount: d.lastCount || 10,
      };
    }
  } catch {
    /* keep empty */
  }
  mem = mem ? mergeUsed(remote, mem) : remote;
  return mem;
}

export async function saveShareUsed(file: ShareUsedFile): Promise<void> {
  mem = trim(file);
  try {
    const handle = await resolveAnalyticsKV();
    if (!handle?.kv) return;
    await handle.kv.put(SHARE_USED_KEY, JSON.stringify(mem), { expirationTtl: SHARE_USED_TTL_SEC });
  } catch (err) {
    console.error("saveShareUsed kv", err);
  }
}
