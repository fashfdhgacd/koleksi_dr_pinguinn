/**
 * Upload coverage guard (2026-11-20). On 2026-11-16 LuluStream switched its share links to
 * lplaygo.com; the bot did not know the domain, stored those links as generic "Video g…" embeds and the
 * reply looked normal, so the Lulu server silently vanished from every multi-server page for 4 days.
 * These pure helpers make the bot reply say per host what came in, and shout when a link was not
 * understood or landed as a generic embed next to known-host links (likely a renamed mirror).
 */
import { parseVideoLink } from "./parse.js";

/** Display label per parsed host kind. */
const LABEL = {
  lulu: "Lulu",
  dood: "Dood",
  byse: "Byse",
  "byse-probe": "Byse",
  mxdrop: "MXDrop",
  vidara: "Vidara",
  streamtape: "Streamtape",
  putarin: "Putarin",
  "putarin-folder": "Putarin",
  videy: "Videy",
  indoav: "IndoAV",
  userbokep: "UserBokep",
};

function domainOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return String(url || "").slice(0, 60);
  }
}

/**
 * @param {{ urls?: string[], videos?: any[] }} parsedMsg result of parseMessage()
 * @returns {{ perHost: Record<string, number>, unparsed: Record<string, number>, generic: Record<string, number> }}
 */
export function uploadCoverage(parsedMsg) {
  const perHost = {};
  const unparsed = {};
  const generic = {};
  for (const v of parsedMsg?.videos || []) {
    if (v?.host === "embed") {
      const d = domainOf(v.embed);
      generic[d] = (generic[d] || 0) + 1;
      continue;
    }
    const label = LABEL[v?.host] || String(v?.host || "?");
    perHost[label] = (perHost[label] || 0) + 1;
  }
  for (const u of parsedMsg?.urls || []) {
    if (parseVideoLink(u)) continue;
    const d = domainOf(u);
    unparsed[d] = (unparsed[d] || 0) + 1;
  }
  return { perHost, unparsed, generic };
}

const fmt = (o) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(" · ");

/** Reply lines for the coverage report (empty when the batch has a single known host and no issues). */
export function coverageLines(parsedMsg) {
  const { perHost, unparsed, generic } = uploadCoverage(parsedMsg);
  const out = [];
  const hosts = Object.keys(perHost);
  if (hosts.length > 1 || Object.keys(generic).length) out.push(`📋 Server diterima: ${fmt(perHost) || "-"}`);
  if (Object.keys(generic).length && hosts.length) {
    out.push(
      `🚨 Domain belum dikenal sebagai server: ${fmt(generic)}. Disimpan sebagai embed umum (kategori lainnya, gak gabung ke halaman multi-server). Kalau ini mirror baru Lulu/Dood/Byse/MXDrop/Vidara, kabari biar dikenali.`,
    );
  }
  if (Object.keys(unparsed).length) {
    out.push(`🚨 Link TIDAK dibaca (gak disimpan): ${fmt(unparsed)}`);
  }
  return out;
}

/**
 * Counts reconcile: every queued link must end up in one outcome. Returns a warning line when fewer
 * outcomes than links were recorded (a silent drop), else "".
 * @param {number} queued
 * @param {{ created?: number, skipped?: number, failed?: number, held?: number, queuedKv?: number, rejected?: number, blocked?: number }} t
 */
export function reconcileLine(queued, t) {
  const done =
    (t.created || 0) + (t.skipped || 0) + (t.failed || 0) + (t.held || 0) + (t.queuedKv || 0) + (t.rejected || 0) + (t.blocked || 0);
  if (done >= queued) return "";
  return `🚨 ${queued - done} dari ${queued} link gak jelas nasibnya (gak dibuat, gak skip, gak gagal). Cek /pemilik atau kirim ulang.`;
}
