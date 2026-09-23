"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, EyeOff, LogOut, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SECRET_KEY = "drp_owner_secret";
const POLL_MS = 8_000;

function loadSecret(): string {
  try {
    return sessionStorage.getItem(SECRET_KEY) || "";
  } catch {
    return "";
  }
}

function saveSecret(value: string) {
  try {
    if (value) sessionStorage.setItem(SECRET_KEY, value);
    else sessionStorage.removeItem(SECRET_KEY);
  } catch {
    /* ignore */
  }
}

export function OwnerDashboard() {
  const [secret, setSecret] = useState("");
  const [draft, setDraft] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const s = loadSecret();
    if (s) {
      setSecret(s);
      setAuthed(true);
    }
  }, []);

  const fetchCount = useCallback(async (key: string) => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/online", {
        method: "GET",
        headers: { "x-online-key": key },
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; count?: number; error?: string };
      if (!res.ok || !data.ok) {
        setAuthed(false);
        setCount(null);
        setError(data.error === "forbidden" ? "Kunci salah atau belum di-set di server." : "Gagal ambil data.");
        saveSecret("");
        setSecret("");
        return;
      }
      setAuthed(true);
      setCount(typeof data.count === "number" ? data.count : 0);
      setLastAt(new Date());
      saveSecret(key);
      setSecret(key);
    } catch {
      setError("Jaringan error. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authed || !secret) return;
    void fetchCount(secret);
    const t = window.setInterval(() => void fetchCount(secret), POLL_MS);
    return () => window.clearInterval(t);
  }, [authed, secret, fetchCount]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = draft.trim();
    if (key.length < 8) {
      setError("Kunci minimal 8 karakter.");
      return;
    }
    setSecret(key);
    setAuthed(true);
    void fetchCount(key);
  }

  function logout() {
    saveSecret("");
    setSecret("");
    setAuthed(false);
    setCount(null);
    setDraft("");
    setError(null);
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-12 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Dr. Pinguin</p>
            <h1 className="mt-1 font-display text-2xl tracking-tight">Panel Pemilik</h1>
            <p className="mt-1 text-sm text-muted">Analitik live — hanya kamu yang bisa lihat.</p>
          </div>
          <Link
            to="/"
            className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            ← Katalog
          </Link>
        </div>

        {!authed ? (
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
          >
            <label className="mb-2 block text-sm font-medium" htmlFor="owner-key">
              Kunci pemilik
            </label>
            <p className="mb-4 text-xs text-muted">
              Sama dengan <code className="rounded bg-secondary px-1">ONLINE_VIEW_SECRET</code> di
              Vercel & Cloudflare.
            </p>
            <Input
              id="owner-key"
              type="password"
              autoComplete="off"
              placeholder="Tempel kunci rahasia…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mb-3"
            />
            {error ? <p className="mb-3 text-xs text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Memeriksa…" : "Masuk"}
            </Button>
          </form>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-1">
              <div className="rounded-2xl border border-border bg-surface p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Users className="size-4" />
                    Online sekarang
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void fetchCount(secret)}
                    disabled={loading}
                    aria-label="Refresh"
                  >
                    <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                <p className="mt-3 font-display text-5xl tabular-nums tracking-tight">
                  {count === null ? "—" : count}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  Live · update tiap {POLL_MS / 1000}s
                  {lastAt
                    ? ` · ${lastAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                    : ""}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
                <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                  <Activity className="size-4" />
                  Catatan
                </div>
                <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed">
                  <li>Angka = tab aktif yang kirim heartbeat (±45 detik terakhir).</li>
                  <li>.com (Cloudflare) dan .site (Vercel) bisa beda count (rumah beda).</li>
                  <li>Halaman ini noindex — tidak masuk Google.</li>
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={logout}>
                <LogOut className="size-3.5" />
                Keluar
              </Button>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <EyeOff className="size-3.5" />
                Sesi hanya di tab ini (sessionStorage)
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
