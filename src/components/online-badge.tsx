"use client";

import { useEffect, useState } from "react";

const ID_KEY = "drp_online_id";
const SHOW_KEY = "drp_show_online";
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

function readUnlocked(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const q = new URLSearchParams(window.location.search);
    if (q.get("live") === "1" || q.get("online") === "1") {
      localStorage.setItem(SHOW_KEY, "1");
      return true;
    }
    if (q.get("live") === "0" || q.get("online") === "0") {
      localStorage.removeItem(SHOW_KEY);
      return false;
    }
    return localStorage.getItem(SHOW_KEY) === "1";
  } catch {
    return false;
  }
}

export function OnlineBadge() {
  const [count, setCount] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  // Heartbeat tetap jalan (count akurat), badge hanya tampil kalau unlocked
  useEffect(() => {
    setVisible(readUnlocked());

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
        // silent
      }
    }

    void beat();
    const timer = window.setInterval(() => void beat(), HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };
    document.addEventListener("visibilitychange", onVisible);

    // Toggle rahasia: Ctrl + Shift + O
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "O" || e.key === "o")) {
        e.preventDefault();
        try {
          const next = localStorage.getItem(SHOW_KEY) !== "1";
          if (next) localStorage.setItem(SHOW_KEY, "1");
          else localStorage.removeItem(SHOW_KEY);
          setVisible(next);
        } catch {
          setVisible((v) => !v);
        }
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!visible || count === null) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 z-50 select-none"
      aria-live="polite"
      title="Online sekarang (rahasia — Ctrl+Shift+O untuk tutup)"
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
