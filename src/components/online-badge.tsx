"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "drp_online_id";
const HEARTBEAT_MS = 20_000;

function getOrCreateId(): string {
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]+$/.test(existing)) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 24)
        : `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return `u${Date.now().toString(36)}`;
  }
}

export function OnlineBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = getOrCreateId();

    async function beat() {
      try {
        const res = await fetch("/api/online", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (!cancelled && typeof data.count === "number") {
          setCount(Math.max(1, data.count));
        }
      } catch {
        // silent — badge opsional
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

  if (count === null) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 z-50 select-none"
      aria-live="polite"
      title="Pengunjung online sekarang"
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
