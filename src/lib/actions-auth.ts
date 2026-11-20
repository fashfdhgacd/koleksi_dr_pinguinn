/**
 * GitHub Actions caller check, no new Worker env var: the workflow's GITHUB_TOKEN is accepted when
 * GitHub says it can read this private repo (same check as the poster backfill in thumb.$id.ts).
 * One GitHub API call per request; only used by rare cron endpoints (daily host alert).
 */
export async function isRepoActionsRequest(request: Request): Promise<boolean> {
  const token = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length < 20) return false;
  try {
    const res = await fetch("https://api.github.com/repos/fashfdhgacd/koleksi_dr_pinguinn", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "kdp-host-alert" },
      signal: AbortSignal.timeout(8000),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Telegram text for the daily host check (plain text, capped). */
export function hostAlertText(lines: unknown): string {
  const list = (Array.isArray(lines) ? lines : [])
    .map((l) => String(l || "").replace(/\s+/g, " ").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 15);
  if (!list.length) return "";
  return ["🚨 Cek server harian (koleksidrpinguin.com):", ...list.map((l) => `• ${l}`), "", "Detail: GitHub → Daily video sync → Host health."].join("\n");
}

/** Telegram text for the share/OG health check (plain text, capped). */
export function shareAlertText(lines: unknown): string {
  const list = (Array.isArray(lines) ? lines : [])
    .map((l) => String(l || "").replace(/\s+/g, " ").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 15);
  if (!list.length) return "";
  return ["🚨 Kartu share / OG (koleksidrpinguin.com, videyy.icu, videqsss.icu):", ...list.map((l) => `• ${l}`), "", "Detail: GitHub → Site health."].join("\n");
}
