// Daily thumbnail health check (.github/workflows/thumb-health.yml). Walks every catalog source
// (data/*.json feeds incl. all videos-latest / putarin-latest chunks, src/lib/catalog/*.json lists),
// checks the image each card renders first (R2 poster) and repairs what it can, free of extra cost:
//  - bad R2 copy (placeholder md5 / < 3 KB / not an image / near-single-colour): GET /thumb/<id>?h=<day>
//    (cache-busting key) - the Worker sees the placeholder etag, deletes that R2 object and re-resolves
//    through the central guard (src/lib/image-guard.ts). No R2 credentials needed in the workflow.
//  - missing R2 copy: same /thumb call resolves + stores it (or 302s to the brand poster = "missing").
//  - Putarin without a poster entry: resolve the embed's player.image (src/lib/puterin-poster.ts) and
//    add it to data/latest-posters.json (map file only: no chunk files touched).
// Writes data/thumb-health.json with counts per source. DRY_RUN=1: classify only, no requests to
// /thumb, no file writes.  Usage: npx tsx --tsconfig tsconfig.json scripts/thumb-health.mts
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { isPlaceholderMd5, isPlaceholderUrl, MIN_IMAGE_BYTES } from "../src/lib/image-guard";
import { resolvePuterinImage } from "../src/lib/puterin-poster";
import { javCoverFromTitle, isPutarin, isVidey } from "../src/lib/catalog/local-shared";
import { attemptThumbRepair, isCloudflareChallenge, poolUntil } from "./lib/thumb-health-http.mjs";

const require = createRequire(import.meta.url);
const { loadAll } = require("./lib/latest-chunks.cjs");

const DRY = process.env.DRY_RUN === "1";
const SITE = "https://koleksidrpinguin.com";
const R2 = "https://img.koleksidrpinguin.com/posters/typed/";
const REPAIR_CAP = Number(process.env.REPAIR_CAP || 600);
const PUTARIN_CAP = Number(process.env.PUTARIN_CAP || 400);
const DAY = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

type Item = { id?: string; title?: string; embed?: string; source?: string; direct?: string; hidden?: boolean };
const readJson = (p: string) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return undefined;
  }
};
const listOf = (v: unknown): Item[] =>
  (Array.isArray(v) ? v : Array.isArray((v as { items?: unknown[] })?.items) ? (v as { items: Item[] }).items : []).filter(
    (x: Item) => x && typeof x.id === "string" && (x.embed || x.direct),
  );

// ---- sources ----
const sources: Array<[string, Item[]]> = [];
for (const base of ["videos-latest", "putarin-latest"]) sources.push([base, loadAll(base) as Item[]]);
for (const f of fs.readdirSync("data").filter((f) => f.endsWith(".json") && !/^(videos-latest|putarin-latest)(-p\d+|-index)?\.json$/.test(f))) {
  const l = listOf(readJson(path.join("data", f)));
  if (l.length) sources.push([f.replace(/\.json$/, ""), l]);
}
for (const f of fs.readdirSync("src/lib/catalog").filter((f) => f.endsWith(".json"))) {
  const l = listOf(readJson(path.join("src/lib/catalog", f)));
  if (l.length) sources.push([`catalog/${f.replace(/\.json$/, "")}`, l]);
}

const latestPath = "data/latest-posters.json";
const latestPosters: Record<string, string> = readJson(latestPath) || {};
const maps = [readJson("src/lib/catalog/posters.json") || {}, readJson("src/lib/catalog/jav-posters.json") || {}, latestPosters];
const overrides: Record<string, { poster?: string }> = readJson("src/lib/catalog/overrides.json") || {};
const knownPoster = (it: Item) => {
  for (const m of maps) if (typeof m[it.id!] === "string" && m[it.id!].startsWith("http")) return m[it.id!];
  const p = (it as { poster?: string }).poster || overrides[it.id!]?.poster || "";
  return typeof p === "string" && p.startsWith("http") ? p : "";
};

// Near-single-colour JPEG: a flat image compresses to almost nothing per pixel (no decoder needed).
function jpegDims(b: Uint8Array): [number, number] | null {
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xc3) return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    i += 2 + len;
  }
  return null;
}
function nearSingleColour(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf);
  if (!(b[0] === 0xff && b[1] === 0xd8)) return false;
  const d = jpegDims(b);
  return Boolean(d && d[0] * d[1] > 40000 && buf.byteLength / (d[0] * d[1]) < 0.012);
}

type Verdict = "ok" | "placeholder" | "small" | "blank" | "notimage" | "absent" | "error";
let blockedByCloudflare = false;
async function checkR2(id: string): Promise<Verdict> {
  if (blockedByCloudflare) return "error";
  const v = await checkR2Once(id);
  return v === "error" && !blockedByCloudflare ? checkR2Once(id) : v;
}
// Why a check errored (first few only), so an all-"error" run is diagnosable instead of silent.
const errorSamples: Array<{ id: string; why: string }> = [];
const repairErrorSamples: Array<{ id: string; why: string }> = [];
const UA = { "user-agent": "koleksidrpinguin-thumb-health/1.0 (+https://github.com/fashfdhgacd/koleksi_dr_pinguinn)" };
function noteError(id: string, why: string) {
  if (errorSamples.length < 20) errorSamples.push({ id, why });
}
function stopOnChallenge(id: string, response: Response): boolean {
  if (!isCloudflareChallenge(response)) return false;
  blockedByCloudflare = true;
  noteError(id, `Cloudflare challenge (HTTP ${response.status})`);
  return true;
}
async function checkR2Once(id: string): Promise<Verdict> {
  try {
    const h = await fetch(R2 + id, { method: "HEAD", headers: UA, signal: AbortSignal.timeout(15000) });
    if (stopOnChallenge(id, h)) return "error";
    if (h.status === 404) return "absent";
    if (!h.ok) {
      noteError(id, `HTTP ${h.status} ${h.headers.get("server") || ""} ${h.headers.get("cf-mitigated") || ""}`.trim());
      return "error";
    }
    if (isPlaceholderMd5(h.headers.get("etag"))) return "placeholder";
    if (!/^image\//i.test(h.headers.get("content-type") || "")) return "notimage";
    const len = Number(h.headers.get("content-length") || 0);
    if (len && len < MIN_IMAGE_BYTES) return "small";
    if (len && len < 20000) {
      const get = await fetch(R2 + id, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (stopOnChallenge(id, get)) return "error";
      if (!get.ok) {
        noteError(id, `GET HTTP ${get.status}`);
        return "error";
      }
      if (!/^image\//i.test(get.headers.get("content-type") || "")) return "notimage";
      const buf = await get.arrayBuffer();
      if (buf.byteLength < MIN_IMAGE_BYTES) return "small";
      if (nearSingleColour(buf)) return "blank";
    }
    return "ok";
  } catch (e) {
    noteError(id, `exception ${(e as Error)?.name || ""}: ${(e as Error)?.message || String(e)}`);
    return "error";
  }
}
// ---- run ----
const seen = new Set<string>();
const stats: Record<string, Record<string, number>> = {};
const work: Array<{ src: string; it: Item }> = [];
for (const [src, items] of sources) {
  stats[src] = { total: 0, ok: 0, placeholder: 0, small: 0, blank: 0, notimage: 0, absent: 0, error: 0, repaired: 0, stillBad: 0, repairError: 0, repairDeferred: 0, noSource: 0, putarinResolved: 0 };
  for (const it of items) {
    if (!it.id || seen.has(it.id) || it.hidden || isVidey(it as never)) continue;
    seen.add(it.id);
    stats[src].total++;
    work.push({ src, it });
  }
}

let putarinBudget = PUTARIN_CAP;
let repairsLeft = REPAIR_CAP;
const added: Record<string, string> = {};
const badIds: Array<{ id: string; src: string; verdict: string }> = [];
let checked = 0;
await poolUntil(work, 10, async ({ src, it }) => {
  const s = stats[src];
  let poster = knownPoster(it);
  const putarin = isPutarin(it as never);
  if (putarin && (!poster || isPlaceholderUrl(poster)) && !javCoverFromTitle(String(it.title || "")) && putarinBudget-- > 0) {
    const r = await resolvePuterinImage(it.id!).catch(() => null);
    if (r) {
      added[it.id!] = r.url;
      poster = r.url;
      s.putarinResolved++;
    }
  }
  const has = Boolean(poster || (putarin && (javCoverFromTitle(String(it.title || "")) || /^[A-Za-z0-9]{6,20}$/.test(it.id!))));
  const v = await checkR2(it.id!);
  if (blockedByCloudflare) return;
  checked++;
  s[v]++;
  if (v === "ok") return;
  if (v === "absent" && !has) {
    s.noSource++;
    return; // card shows the brand poster by design
  }
  if (DRY || v === "error") {
    if (v !== "error") badIds.push({ id: it.id!, src, verdict: v });
    return;
  }
  // Placeholder etag: the Worker deletes it itself. Small / blank / not-image copies are not on the
  // md5 list, so the Worker would keep serving them: report those for a manual look.
  if (v === "absent" || v === "placeholder") {
    if (repairsLeft <= 0) {
      s.repairDeferred++;
      badIds.push({ id: it.id!, src, verdict: v });
      return;
    }
    repairsLeft--;
    const repair = await attemptThumbRepair({
      id: it.id!,
      site: SITE,
      day: DAY,
      headers: UA,
      verify: () => checkR2(it.id!),
    });
    if (repair.state === "repaired") s.repaired++;
    else if (repair.state === "unresolved") {
      s.stillBad++;
      badIds.push({ id: it.id!, src, verdict: v });
    } else {
      if (repair.state === "challenge") blockedByCloudflare = true;
      s.repairError++;
      if (repairErrorSamples.length < 20) repairErrorSamples.push({ id: it.id!, why: repair.reason });
    }
  } else {
    s.stillBad++;
    badIds.push({ id: it.id!, src, verdict: v });
  }
}, () => blockedByCloudflare);

const totals: Record<string, number> = {};
for (const s of Object.values(stats)) for (const [k, n] of Object.entries(s)) totals[k] = (totals[k] || 0) + n;
const report = {
  checkedAt: new Date().toISOString(),
  dryRun: DRY,
  partial: blockedByCloudflare,
  checked,
  totals,
  sources: Object.fromEntries(Object.entries(stats).filter(([, s]) => s.total)),
  latestPostersAdded: Object.keys(added).length,
  bad: badIds.slice(0, 300),
  errorSamples,
  repairErrorSamples,
};
console.log(JSON.stringify({ partial: report.partial, checked, errorSamples, repairErrorSamples }, null, 1));
console.log(JSON.stringify({ totals, latestPostersAdded: report.latestPostersAdded, sources: report.sources }, null, 1));
if (blockedByCloudflare) {
  console.error("thumb-health: stopped by a Cloudflare challenge; no partial report or poster map was written");
  process.exitCode = 1;
} else if (!DRY) {
  if (Object.keys(added).length) {
    const fresh = readJson(latestPath) || {};
    fs.writeFileSync(latestPath, JSON.stringify({ ...fresh, ...added }, null, 2) + "\n");
  }
  fs.writeFileSync("data/thumb-health.json", JSON.stringify(report, null, 1) + "\n");
}
if (totals.repairError) {
  console.warn(`thumb-health: ${totals.repairError} repairs could not be checked; see repairErrorSamples above`);
}
// A run where most checks errored is a broken check, not a healthy site: fail the job so it shows red.
if ((totals.total || 0) > 0 && (totals.error || 0) > totals.total / 2) {
  console.error(`thumb-health: ${totals.error}/${totals.total} checks errored; see errorSamples above`);
  process.exitCode = 1;
}
