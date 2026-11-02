/**
 * UTM campaign tags (utm_source / utm_medium / utm_campaign / utm_content) for owner analytics.
 * Pure helpers, no server imports (used by the ping client, /api/online and stats14).
 *
 * Stored compactly in analytics_events.utm as "source|medium|campaign|content" on the landing
 * pageview only (same row that is already written; no extra writes). Values are lowercased and
 * limited to [a-z0-9._-] so a link cannot inject anything odd into the owner panel.
 */

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;
const PART_MAX = 40;

function clean(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s+]+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, PART_MAX);
}

/**
 * "source|medium|campaign|content" from a query string ("?utm_source=..."), or null when the URL
 * carries neither utm_source nor utm_campaign.
 */
export function parseUtm(search: string | null | undefined): string | null {
  const s = String(search || "").slice(0, 600);
  if (!/utm_/i.test(s)) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(s.startsWith("?") ? s.slice(1) : s.includes("?") ? s.slice(s.indexOf("?") + 1) : s);
  } catch {
    return null;
  }
  const get = (k: string) => {
    for (const [key, val] of params) if (key.toLowerCase() === k) return clean(val);
    return "";
  };
  const parts = UTM_KEYS.map(get);
  if (!parts[0] && !parts[2]) return null;
  return parts.join("|");
}

/** Re-validate a stored/received "a|b|c|d" key (anything else -> null). */
export function normalizeUtmKey(key: unknown): string | null {
  if (typeof key !== "string" || !key) return null;
  const parts = key.split("|").slice(0, 4).map(clean);
  while (parts.length < 4) parts.push("");
  if (!parts[0] && !parts[2]) return null;
  return parts.join("|");
}

/** Owner-panel label: "justpaste / paste · organic · konten" ("-" for a missing part). */
export function utmLabel(key: string): string {
  const [source, medium, campaign, content] = String(key || "").split("|");
  let out = `${source || "-"} / ${medium || "-"}`;
  if (campaign) out += ` · ${campaign}`;
  if (content) out += ` · ${content}`;
  return out;
}

/**
 * Site watch link tagged for a traffic source, e.g.
 * https://koleksidrpinguin.com/watch/ID?utm_source=telegram&utm_medium=channel&utm_campaign=organic&utm_content=ID
 */
export function taggedWatchUrl(host: string, id: string, source: string, medium: string, campaign = "organic"): string {
  const q = new URLSearchParams({ utm_source: source, utm_medium: medium, utm_campaign: campaign, utm_content: String(id) });
  return `${host}/watch/${encodeURIComponent(id)}?${q}`;
}
