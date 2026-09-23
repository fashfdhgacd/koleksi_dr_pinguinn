"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  EyeOff,
  Globe,
  LogOut,
  Monitor,
  RefreshCw,
  Smartphone,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SECRET_KEY = "drp_owner_secret";
const POLL_MS = 8_000;

type OwnerStats = {
  ok?: boolean;
  owner?: boolean;
  error?: string;
  hint?: string;
  online?: number;
  peakToday?: number;
  peakDay?: string;
  views24h?: number;
  hourly?: { hour: string; views: number }[];
  topPaths?: { path: string; views: number }[];
  topRefs?: { ref: string; views: number }[];
  devices?: { device: string; views: number }[];
  hosts?: { host: string; views: number }[];
};

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

function BarChart({ data }: { data: { hour: string; views: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.views));
  return (
    <div className="flex h-28 items-end gap-0.5 sm:gap-1">
      {data.map((d) => (
        <div key={d.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-emerald-500/80 transition-[height]"
            style={{ height: `${Math.max(4, (d.views / max) * 100)}%` }}
            title={`${d.hour}: ${d.views}`}
          />
          <span className="hidden text-[9px] text-muted sm:block">{d.hour.slice(0, 2)}</span>
        </div>
      ))}
    </div>
  );
}

function RankList({ items }: { items: { label: string; views: number }[] }) {
  if (!items.length) {
    return <p className="text-xs text-muted">Belum ada data (tunggu traffic).</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.views));
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`} className="text-xs">
          <div className="mb-0.5 flex justify-between gap-2">
            <span className="truncate font-medium text-foreground" title={item.label}>
              {item.label || "/"}
            </span>
            <span className="shrink-0 tabular-nums text-muted">{item.views}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${(item.views / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OwnerDashboard() {
  const [secret, setSecret] = useState("");
  const [draft, setDraft] = useState("");
  const [stats, setStats] = useState<OwnerStats | null>(null);
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

  const fetchStats = useCallback(async (key: string) => {
    if (!key) return;
    setLoading(true);
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
        if (data.error === "not_configured") {
          setError(
            data.hint ||
              "ONLINE_VIEW_SECRET belum di-set di server (.com = Cloudflare). Set env lalu redeploy.",
          );
        } else if (data.error === "forbidden") {
          setError("Kunci salah. Pastikan sama persis dengan yang di Cloudflare/Vercel.");
        } else {
          setError("Gagal ambil data.");
        }
        saveSecret("");
        setSecret("");
        return;
      }
      setAuthed(true);
      setStats(data);
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
    void fetchStats(secret);
    const t = window.setInterval(() => void fetchStats(secret), POLL_MS);
    return () => window.clearInterval(t);
  }, [authed, secret, fetchStats]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = draft.trim();
    if (key.length < 8) {
      setError("Kunci minimal 8 karakter.");
      return;
    }
    setSecret(key);
    setAuthed(true);
    void fetchStats(key);
  }

  function logout() {
    saveSecret("");
    setSecret("");
    setAuthed(false);
    setStats(null);
    setDraft("");
    setError(null);
  }

  const online = stats?.online ?? null;
  const peak = stats?.peakToday ?? 0;
  const views24 = stats?.views24h ?? 0;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
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
              Domain <strong>.com</strong> = Cloudflare · <strong>.site</strong> = Vercel. Env harus diisi di
              keduanya.
            </p>
            <Input
              id="owner-key"
              type="password"
              autoComplete="off"
              placeholder="Tempel ONLINE_VIEW_SECRET…"
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted">
                Live · tiap {POLL_MS / 1000}s
                {lastAt
                  ? ` · ${lastAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : ""}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void fetchStats(secret)}
                disabled={loading}
              >
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Users className="size-3.5" />
                  Online sekarang
                </div>
                <p className="mt-2 font-display text-4xl tabular-nums tracking-tight">
                  {online === null ? "—" : online}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Live
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <TrendingUp className="size-3.5" />
                  Peak hari ini
                </div>
                <p className="mt-2 font-display text-4xl tabular-nums tracking-tight">{peak}</p>
                <p className="mt-1 text-[11px] text-muted">{stats?.peakDay || "—"}</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Activity className="size-3.5" />
                  Views 24 jam
                </div>
                <p className="mt-2 font-display text-4xl tabular-nums tracking-tight">{views24}</p>
                <p className="mt-1 text-[11px] text-muted">pageview beacon</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium">
                <Activity className="size-4" />
                Views per jam (24 jam, WIB)
              </div>
              <BarChart data={stats?.hourly || []} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="mb-3 text-sm font-medium">Top halaman</div>
                <RankList
                  items={(stats?.topPaths || []).map((p) => ({
                    label: p.path,
                    views: p.views,
                  }))}
                />
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="mb-3 text-sm font-medium">Top referrer / origin</div>
                <RankList
                  items={(stats?.topRefs || []).map((r) => ({
                    label: r.ref,
                    views: r.views,
                  }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Smartphone className="size-4" />
                  Perangkat
                </div>
                <RankList
                  items={(stats?.devices || []).map((d) => ({
                    label: d.device,
                    views: d.views,
                  }))}
                />
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Globe className="size-4" />
                  Host (domain)
                </div>
                <RankList
                  items={(stats?.hosts || []).map((h) => ({
                    label: h.host,
                    views: h.views,
                  }))}
                />
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
                  <Monitor className="size-3" />
                  .com vs .site terpisah per isolate server
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4 text-[11px] leading-relaxed text-muted">
              <strong className="text-foreground">Catatan:</strong> data in-memory per edge
              isolate. Set <code className="rounded bg-secondary px-1">ONLINE_ALERT_THRESHOLD</code>+
              bot Telegram untuk notifikasi peak.
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={logout}>
                <LogOut className="size-3.5" />
                Keluar
              </Button>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <EyeOff className="size-3.5" />
                Sesi tab ini · noindex
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
