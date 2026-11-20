// Pure logic for scripts/host-health.mjs (tested in scripts/host-health.test.mjs).
import { drpKindOfItem, DRP_SOURCES } from "../../src/lib/catalog/drp-hosts.js";

export const DRP_FAMILIES = Object.values(DRP_SOURCES); // LuluStream, DoodStream, Byse, MXDrop, Vidara

/** Host family of a catalog item ("" = not a server we track). */
export function hostFamily(it) {
  const drp = drpKindOfItem(it);
  if (drp) return DRP_SOURCES[drp];
  const blob = `${it?.source || ""} ${it?.embed || ""}`.toLowerCase();
  if (/streamtape|strcloud|streamta\.pe/.test(blob)) return "Streamtape";
  if (/putarin|puterin/.test(blob)) return "Putarin";
  if (/indoav/.test(blob)) return "IndoAV";
  if (/userbokep/.test(blob)) return "Userbokep";
  if (/videy|aceimg/.test(blob)) return "Videy";
  return "";
}

export function embedHost(it) {
  try {
    return new URL(String(it?.embed || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * @param {any[]} items  all catalog rows (deduped by id by the caller)
 * @param {string} today YYYY-MM-DD
 * @returns {{ counts: Record<string, number>, recent: Record<string, number>, topHosts: Record<string, string[]> }}
 */
export function summarize(items, today, recentDays = 3) {
  const counts = {};
  const recent = {};
  const hostTally = {};
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - recentDays * 86400_000).toISOString().slice(0, 10);
  for (const it of items) {
    if (!it || it.hidden) continue;
    const fam = hostFamily(it);
    if (!fam) continue;
    counts[fam] = (counts[fam] || 0) + 1;
    const d = String(it.date || it.updated_at || "").slice(0, 10);
    if (d && d >= since) recent[fam] = (recent[fam] || 0) + 1;
    const h = embedHost(it);
    if (h) {
      hostTally[fam] ||= {};
      hostTally[fam][h] = (hostTally[fam][h] || 0) + 1;
    }
  }
  const topHosts = {};
  for (const [fam, t] of Object.entries(hostTally)) {
    topHosts[fam] = Object.entries(t)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([h]) => h);
  }
  return { counts, recent, topHosts };
}

/**
 * Alerts from today's summary vs the previous saved counts.
 * - a host's visible count drops > maxDrop (20 %) or to 0;
 * - a DRP host (uploaded together with the others) got 0 new rows in the recent window while at
 *   least two other DRP hosts got >= minPeer each (the 2026-11-16 Lulu domain switch);
 * - dead embed domains (DNS/TLS failures, from the caller's probe).
 */
export function hostAlerts({ counts, recent }, prevCounts = {}, deadDomains = [], { maxDrop = 0.2, minPeer = 10 } = {}) {
  const out = [];
  for (const [fam, before] of Object.entries(prevCounts || {})) {
    const now = counts[fam] || 0;
    if (before > 0 && now === 0) out.push(`${fam}: ${before} → 0 video (hilang semua)`);
    else if (before >= 20 && now < before * (1 - maxDrop)) out.push(`${fam}: ${before} → ${now} video (turun ${Math.round((1 - now / before) * 100)}%)`);
  }
  const peers = DRP_FAMILIES.filter((f) => (recent[f] || 0) >= minPeer);
  if (peers.length >= 2) {
    for (const f of DRP_FAMILIES) {
      if ((counts[f] || 0) > 0 && !(recent[f] || 0)) {
        out.push(`${f}: 0 upload baru 3 hari terakhir, padahal ${peers.map((p) => `${p} ${recent[p]}`).join(", ")} (domain/link-nya ganti?)`);
      }
    }
  }
  for (const d of deadDomains) out.push(`Domain embed mati: ${d.host} (${d.family}, ${d.error})`);
  return out;
}
