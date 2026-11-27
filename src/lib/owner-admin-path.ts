/**
 * Owner / admin / login / API paths that must never load ad scripts
 * (Wynq tag, TrafficStars SDK, ExoClick, popunder handlers, banners).
 * Independent of catalog adFree flags (optional per-landing; none are ad-free today).
 */
export function isOwnerAdminPath(path: string | undefined | null): boolean {
  const raw = String(path || "")
    .split(/[?#]/)[0]
    .toLowerCase();
  const trimmed = raw.replace(/\/+$/, "") || "/";
  const bare = trimmed.replace(/^\/(ms|id|en)(?=\/|$)/, "") || "/";
  return (
    bare === "/pemilik" ||
    bare.startsWith("/pemilik/") ||
    bare === "/api" ||
    bare.startsWith("/api/") ||
    bare === "/admin" ||
    bare.startsWith("/admin/") ||
    bare === "/login" ||
    bare.startsWith("/login/")
  );
}
