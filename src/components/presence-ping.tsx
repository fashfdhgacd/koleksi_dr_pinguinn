"use client";

import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

const ID_KEY = "drp_online_id";
const HEARTBEAT_MS = 60_000;
const MIN_GAP_MS = 20_000;
const BOT_RE =
  /bot|crawl|spider|slurp|headless|webdriver|puppeteer|playwright|phantom|scrapy|httpclient|curl\/|wget|python-requests|axios\/|node-fetch|bytespider|gptbot|claudebot|ccbot|semrush|ahrefs|dataforseo|petalbot/i;

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
  const lastBeat = useRef(0);

  useEffect(() => {
    if (isAutomated()) return;
    if (pathname !== "/pemilik" && !hasAgeConsent()) return;

    const id = getOrCreateId();

    async function beat(recordPage: boolean) {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (!recordPage && now - lastBeat.current < MIN_GAP_MS) return;
      lastBeat.current = now;
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
          keepalive: true,
        });
      } catch {
        /* silent */
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
