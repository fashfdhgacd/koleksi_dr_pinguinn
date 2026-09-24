"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SECRET_KEY = "drp_owner_secret";
const SECRET_LEGACY = "drp_online_secret";
const POLL_MS = 20_000;

type OwnerStats = {
  ok?: boolean;
  owner?: boolean;
  error?: string;
  hint?: string;
  online?: number;
  count?: number;
};

function loadSecret(): string {
  try {
    return sessionStorage.getItem(SECRET_KEY) || sessionStorage.getItem(SECRET_LEGACY) || "";
  } catch {
    return "";
  }
}

function saveSecret(value: string) {
  try {
    if (value) {
      sessionStorage.setItem(SECRET_KEY, value);
      sessionStorage.setItem(SECRET_LEGACY, value);
    } else {
      sessionStorage.removeItem(SECRET_KEY);
      sessionStorage.removeItem(SECRET_LEGACY);
    }
  } catch {
    /* ignore */
  }
}

export function OwnerDashboard() {
  const [secret, setSecret] = useState("");
  const [draft, setDraft] = useState("");
  const [online, setOnline] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);
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
        setOnline(null);
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
      setOnline(Math.max(0, data.online ?? data.count ?? 0));
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
    setOnline(null);
    setDraft("");
    setError(null);
  }

  return (
    <div className="min-h-dvh text-zinc-100" style={{ backgroundColor: "#0f0f11" }}>
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Dr. Pinguin</p>
            <h1 className="mt-1 font-display text-2xl tracking-tight text-zinc-50">Online</h1>
          </div>
          <Link
            to="/"
            className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-zinc-500 transition hover:text-zinc-200"
          >
            Katalog
          </Link>
        </header>

        {!authed ? (
          <form onSubmit={onSubmit} className="rounded-2xl border border-white/[0.08] bg-[#141416] p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Shield className="size-4 text-emerald-400" />
              Masuk
            </div>
            <Input
              type="password"
              autoComplete="off"
              placeholder="ONLINE_VIEW_SECRET"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mb-3 h-11 border-white/[0.08] bg-[#0f0f11]"
            />
            {error ? <p className="mb-3 text-xs text-red-400">{error}</p> : null}
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? "Memeriksa..." : "Masuk"}
            </Button>
          </form>
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-[#141416] px-6 py-10 text-center">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Sedang online</p>
            <p className="mt-3 font-display text-7xl tabular-nums leading-none text-zinc-50">
              {online == null ? "—" : online.toLocaleString("id-ID")}
            </p>
            <p className="mt-3 text-sm text-zinc-500">pengunjung aktif ± 2 menit</p>
            {error ? <p className="mt-4 text-xs text-red-400">{error}</p> : null}
            <div className="mt-8 flex justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void fetchOnline(secret)}>
                Refresh
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={logout}>
                Keluar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
