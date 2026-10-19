"use client";

import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Pageview ping: one POST /api/online per page (first load and every SPA navigation), nothing else.
 *
 * Cost (Oct 2026): the old 90 s heartbeat was most of the Worker requests and a big part of CPU. There
 * is no heartbeat now. The owner panel's "online" number is the count of visitors with a pageview in
 * the last 5 minutes (D1 analytics_sessions.last_seen_at, updated by every pageview).
 */
const ID_KEY = "drp_online_id";
const BOT_RE =
  /bot|crawl|spider|slurp|headless|webdriver|puppeteer|playwright|phantom|scrapy|httpclient|curl\/|wget|python-requests|axios\/|node-fetch|bytespider|gptbot|claudebot|ccbot|semrush|ahrefs|dataforseo|petalbot/i;

function getOrCreateId(): string {
  try {
    const existing = localStorage.getItem(ID_KEY) || sessionStorage.getItem(ID_KEY);
    if (existing && /^[a-zA-Z0-9_-]+$/.test(existing)) {
      localStorage.setItem(ID_KEY, existing);
      return existing;
    }
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 24)
        : `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    return `u${Date.now().toString(36)}`;
  }
}

function isAutomated(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  if (!ua || BOT_RE.test(ua)) return true;
  const w = window as unknown as { __webdriver?: unknown; webdriver?: boolean };
  if (navigator.webdriver || w.webdriver || w.__webdriver) return true;
  return false;
}

function hasAgeConsent(): boolean {
  try {
    if (window.localStorage.getItem("dp_age_ok") === "1") return true;
  } catch {
    /* ignore */
  }
  return document.cookie.split(";").some((c) => c.trim().startsWith("dp_age_ok="));
}

export function PresencePing() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lastPath = useRef("");

  useEffect(() => {
    if (isAutomated()) return;

    const id = getOrCreateId();

    async function beat() {
      try {
        const body: Record<string, string> = {
          id,
          path: pathname || window.location.pathname,
          ref: document.referrer || "",
          host: window.location.hostname,
        };
        const payload = JSON.stringify({
          ...body,
          eventId: `${id}-${pathname || ""}-${Math.floor(Date.now() / 60000)}`,
        });
        await fetch("/api/online", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          credentials: "same-origin",
          cache: "no-store",
          keepalive: true,
        });
      } catch {
        /* silent */
      }
    }

    // One ping per page: only when the path really changed (not on a re-render of the same page).
    // A page opened in a background tab is sent once it is first shown.
    let onVisible: (() => void) | null = null;
    const send = () => {
      if (lastPath.current === pathname) return;
      if (document.visibilityState === "hidden") {
        if (onVisible) return;
        onVisible = () => {
          if (document.visibilityState !== "visible") return;
          if (onVisible) document.removeEventListener("visibilitychange", onVisible);
          onVisible = null;
          send();
        };
        document.addEventListener("visibilitychange", onVisible);
        return;
      }
      lastPath.current = pathname;
      void beat();
    };
    let wait = 0;
    if (pathname === "/pemilik" || hasAgeConsent()) send();
    else {
      // Age gate still open on this page: a local check (no network) sends the ping once the visitor
      // accepts, so a first visit that never navigates is still counted.
      wait = window.setInterval(() => {
        if (!hasAgeConsent()) return;
        window.clearInterval(wait);
        send();
      }, 1500);
    }
    return () => {
      if (wait) window.clearInterval(wait);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return null;
}
