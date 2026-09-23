"use client";

import { useEffect } from "react";

const ID_KEY = "drp_online_id";
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

/** Heartbeat tanpa UI — biar count di /pemilik akurat. */
export function PresencePing() {
  useEffect(() => {
    const id = getOrCreateId();

    async function beat() {
      try {
        await fetch("/api/online", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
          credentials: "same-origin",
          cache: "no-store",
        });
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
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
