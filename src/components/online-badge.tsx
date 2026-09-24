"use client";

import { useEffect, useState } from "react";

const ID_KEY = "drp_online_id";
const SECRET_KEY = "drp_owner_secret";
const SECRET_KEY_LEGACY = "drp_online_secret";
const HEARTBEAT_MS = 20_000;

function getOrCreateId(): string {
  try {
    const existing = sessionStorage.getItem(ID_KEY);
    if (existing && /^[a-zA-Z0-9_-]+$/.test(existing)) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 24)
        : `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    return `u${Date.now().toString(36)}`;
  }
}

/** Ambil kunci pemilik dari URL (?k= / ?key=) atau sessionStorage. */
function resolveOwnerSecret(): string | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const fromUrl = (q.get("k") || q.get("key") || "").trim();
    if (fromUrl === "0" || fromUrl === "off") {
      sessionStorage.removeItem(SECRET_KEY);
      return null;
    }
    if (fromUrl.length >= 8) {
      sessionStorage.setItem(SECRET_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(SECRET_KEY) || sessionStorage.getItem(SECRET_KEY_LEGACY);
  } catch {
    return null;
  }
}

export function OnlineBadge() {
  const [count, setCount] = useState<number | null>(null);
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = getOrCreateId();

    async function beat() {
      const secret = resolveOwnerSecret();
      const isOwner = Boolean(secret);
      if (!cancelled) setOwner(isOwner);

      try {
        const res = await fetch("/api/online", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(secret ? { "x-online-key": secret } : {}),
          },
          body: JSON.stringify(secret ? { id, key: secret } : { id }),
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number; online?: number; owner?: boolean };
        if (cancelled) return;
        const n = typeof data.count === "number" ? data.count : data.online;
        if (data.owner && typeof n === "number") {
          setCount(Math.max(0, n));
        } else {
          setCount(null);
        }
      } catch {
        // silent
      }
    }

    void beat();
    const timer = window.setInterval(() => void beat(), HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!owner || count === null) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 z-50 select-none"
      aria-live="polite"
      title="Hanya pemilik — tambah ?k=0 di URL untuk sembunyikan"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/80 bg-background/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur-md">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="font-medium tabular-nums text-foreground">{count}</span>
        <span className="text-muted">online</span>
      </div>
    </div>
  );
}
