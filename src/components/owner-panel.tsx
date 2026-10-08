"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  loadSecret,
  saveSecret,
  deltaPct,
  POLL_MS,
  type OwnerStats,
} from "@/components/owner-dashboard-shared";
import { OwnerLoginForm } from "@/components/owner-login-form";
import { OwnerAuthedTop } from "@/components/owner-authed-top";
import { OwnerAuthedBottom } from "@/components/owner-authed-bottom";
import { HiddenListSection } from "@/components/owner-hidden-list";
import { OwnerTelegramStatus } from "@/components/owner-telegram-status";

export function OwnerDashboard() {
  const [secret, setSecret] = useState("");
  const [draft, setDraft] = useState("");
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [tickAt, setTickAt] = useState<number>(0);
  const timerRef = useRef<number | null>(null);

  const fetchOnline = useCallback(async (key: string, quiet = false) => {
    if (!key) return;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/online", {
        method: "GET",
        headers: { "x-online-key": key },
        cache: "no-store",
      });
      const data = (await res.json()) as OwnerStats;
      if (!res.ok || !data.ok) {
        setAuthed(false);
        setStats(null);
        setError(
          data.error === "not_configured"
            ? data.hint || "ONLINE_VIEW_SECRET belum di-set."
            : data.error === "forbidden"
              ? "Kunci salah."
              : "Gagal ambil data.",
        );
        saveSecret("");
        setSecret("");
        return;
      }
      setAuthed(true);
      setStats(data);
      setTickAt(Date.now());
      saveSecret(key);
      setSecret(key);
    } catch {
      if (!quiet) setError("Jaringan error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const s = loadSecret();
    if (s) {
      setSecret(s);
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    if (!authed || !secret) return;
    void fetchOnline(secret);
    const tick = () => {
      if (document.visibilityState === "visible") void fetchOnline(secret, true);
    };
    timerRef.current = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [authed, secret, fetchOnline]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = draft.trim();
    if (key.length < 8) {
      setError("Kunci minimal 8 karakter.");
      return;
    }
    setSecret(key);
    setAuthed(true);
    void fetchOnline(key);
  }

  function logout() {
    saveSecret("");
    setSecret("");
    setAuthed(false);
    setStats(null);
    setDraft("");
    setError(null);
  }

  const online = Math.max(0, stats?.online ?? stats?.count ?? 0);
  const devices = useMemo(() => {
    const rows = (stats?.devices || []).filter((d) => d.device !== "bot");
    const total = rows.reduce((s, d) => s + d.views, 0) || 1;
    return rows
      .slice()
      .sort((a, b) => b.views - a.views)
      .map((d) => ({ ...d, pct: Math.round((d.views / total) * 100) }));
  }, [stats]);

  const days = stats?.days || [];
  const vsViews = deltaPct(stats?.viewsToday || 0, stats?.yesterdayViews || 0);
  const vsUniq = deltaPct(stats?.uniqueToday || 0, stats?.yesterdayUnique || 0);

  return (
    <div className="min-h-dvh text-zinc-100" style={{ backgroundColor: "#0f0f11" }}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Dr. Pinguin</p>
            <h1 className="mt-1 font-display text-3xl tracking-tight text-zinc-50">Pengunjung live</h1>
            <p className="mt-1 text-xs text-zinc-500">Hanya orang yang lagi buka tab situs ±2 menit (TTL online ~3 menit). Bot tidak dihitung.</p>
          </div>
          <Link
            to="/"
            className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-zinc-500 transition hover:text-zinc-200"
          >
            Katalog
          </Link>
        </header>

        {!authed ? (
          <OwnerLoginForm
            draft={draft}
            setDraft={setDraft}
            error={error}
            loading={loading}
            onSubmit={onSubmit}
          />
        ) : (
          <>
            {/* Paling atas setelah login: video tersembunyi + badge jumlah + Unhide */}
            <HiddenListSection secret={secret} />
            {/* Status bot Telegram tepat di bawah daftar tersembunyi */}
            <OwnerTelegramStatus secret={secret} />
            <OwnerAuthedTop
              online={online}
              stats={stats}
              tickAt={tickAt}
              error={error}
              vsUniq={vsUniq}
              vsViews={vsViews}
              secret={secret}
            />
            <OwnerAuthedBottom
              days={days}
              devices={devices}
              stats={stats}
              secret={secret}
              loading={loading}
              fetchOnline={fetchOnline}
              logout={logout}
            />
          </>
        )}
      </div>
    </div>
  );
}
