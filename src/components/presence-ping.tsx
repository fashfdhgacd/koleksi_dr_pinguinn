"use client";

import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

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

/** Heartbeat + pageview beacon (tanpa UI). */
export function PresencePing() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lastPath = useRef("");

  useEffect(() => {
    const id = getOrCreateId();

    async function beat(recordPage: boolean) {
      try {
        const body: Record<string, string> = { id };
        if (recordPage) {
          body.path = pathname || window.location.pathname;
          body.ref = document.referrer || "";
          body.host = window.location.hostname;
        }
        await fetch("/api/online", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          credentials: "same-origin",
          cache: "no-store",
        });
      } catch {
        // silent
      }
    }

    const isNewPath = lastPath.current !== pathname;
    lastPath.current = pathname;
    void beat(isNewPath);

    const timer = window.setInterval(() => void beat(false), HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat(false);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return null;
}
