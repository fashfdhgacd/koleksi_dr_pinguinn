"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  Clock,
  Copy,
  EyeOff,
  FlaskConical,
  Globe,
  LogOut,
  RefreshCw,
  Shield,
  Smartphone,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SECRET_KEY = "drp_owner_secret";
const SECRET_LEGACY = "drp_online_secret";
const POLL_MS = 8_000;

type OwnerStats = {
  ok?: boolean;
  owner?: boolean;
  error?: string;
  hint?: string;
  online?: number;
  count?: number;
  peakToday?: number;
  peakDay?: string;
  views24h?: number;
  hourly?: { hour: string; views: number }[];
  topPaths?: { path: string; views: number }[];
  topRefs?: { ref: string; views: number }[];
  devices?: { device: string; views: number }[];
  hosts?: { host: string; views: number }[];
  storage?: "kv" | "kv-rest" | "memory";
  persistOk?: boolean;
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

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

function BarChart({ data }: { data: { hour: string; views: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.views));
  const nowH = new Date(Date.now() + 7 * 3600_000).toISOString().slice(11, 13) + ":00";
  const peak = data.reduce((a, b) => (b.views > a.views ? b : a), { hour: "\u2014", views: 0 });
  return (
    <div>
      <div className="flex h-40 items-end gap-px sm:gap-1">
        {data.map((d) => {
          const isNow = d.hour === nowH;
          const isPeak = d.hour === peak.hour && peak.views > 0;
          return (
            <div key={d.hour} className="group relative flex min-w-0 flex-1 flex-col items-center">
              <div
                className={`w-full rounded-t transition-[height] ${
                  d.views <= 0
                    ? "bg-white/5"
                    : isNow
                      ? "bg-emerald-400"
                      : isPeak
                        ? "bg-emerald-300/90"
                        : "bg-emerald-500/70 group-hover:bg-emerald-400"
                }`}
                style={{ height: `${Math.max(d.views <= 0 ? 4 : 8, (d.views / max) * 100)}%` }}
              />
              <span className={`mt-1 hidden text-[9px] sm:block ${isNow ? "text-emerald-300" : "text-muted"}`}>
                {d.hour.slice(0, 2)}
              </span>
              <div className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background group-hover:block">
                {d.hour} \u00b7 {fmt(d.views)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted">
        <span>
          Peak jam: <strong className="text-foreground">{peak.hour}</strong> ({fmt(peak.views)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-emerald-400" /> jam ini
        </span>
      </div>
    </div>
  );
}

function RankList({
  items,
  hrefPrefix,
}: {
  items: { label: string; views: number }[];
  hrefPrefix?: string;
}) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 px-4 py-8 text-center">
        <p className="text-xs text-muted">Belum ada data. Buka katalog di tab lain, lalu refresh.</p>
      </div>
    );
  }
  const max = Math.max(1, ...items.map((i) => i.views));
  const sum = items.reduce((s, i) => s + i.views, 0) || 1;
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => {
        const inner = (
          <>
            <div className="mb-1 flex justify-between gap-2">
              <span className="truncate font-medium text-foreground" title={item.label}>
                <span className="mr-1.5 tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
                {item.label || "/"}
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                {fmt(item.views)}
                <span className="ml-1 text-[10px] opacity-70">{Math.round((item.views / sum) * 100)}%</span>
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-emerald-500/80" style={{ width: `${(item.views / max) * 100}%` }} />
            </div>
          </>
        );
        return (
          <li key={`${item.label}-${i}`} className="text-xs">
            {hrefPrefix && item.label.startsWith("/") ? (
              <a href={`${hrefPrefix}${item.label}`} target="_blank" rel="noreferrer" className="block hover:opacity-90">
                {inner}
              </a>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DeviceBar({ items }: { items: { device: string; views: number }[] }) {
  const total = items.reduce((s, d) => s + d.views, 0);
  if (!total) return <p className="text-xs text-muted">Belum ada data perangkat.</p>;
  const colors: Record<string, string> = {
    mobile: "bg-emerald-400",
    desktop: "bg-sky-400",
    tablet: "bg-amber-400",
    bot: "bg-zinc-500",
    other: "bg-violet-400",
  };
  return (
    <div className="space-y-3">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-secondary">
        {items.map((d) => (
          <div key={d.device} className={colors[d.device] || "bg-muted"} style={{ width: `${(d.views / total) * 100}%` }} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2 text-xs">
        {items.map((d) => (
          <li key={d.device} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 capitalize text-muted">
              <span className={`size-2 rounded-full ${colors[d.device] || "bg-muted"}`} />
              {d.device}
            </span>
            <span className="tabular-nums text-foreground">
              {fmt(d.views)} \u00b7 {Math.round((d.views / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OwnerDashboard() {
  const [secret, setSecret] = useState("");
  const [draft, setDraft] = useState("");
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [authed, setAuthed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [hideBots, setHideBots] = useState(true);

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
        setError(
          data.error === "not_configured"
            ? data.hint || "ONLINE_VIEW_SECRET belum di-set di Cloudflare (.com)."
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

  async function runSelfTest() {
    if (!secret) return;
    setTesting(true);
    setNote(null);
    try {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "").slice(0, 24)
          : `t${Date.now().toString(36)}`;
      const ping = await fetch("/api/online", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({
          id,
          key: secret,
          path: "/pemilik",
          ref: "self-test",
          host: window.location.hostname,
        }),
        cache: "no-store",
      });
      const pingData = (await ping.json()) as OwnerStats;
      await fetchStats(secret);
      setNote(
        pingData.persistOk === false || pingData.storage === "memory"
          ? "Ping sampai server, tapi storage masih memory. Bind KV di Cloudflare .com."
          : "Ping OK. Beacon tercatat.",
      );
    } catch {
      setNote("Tes gagal \u2014 /api/online tidak merespons.");
    } finally {
      setTesting(false);
    }
  }

  async function copyReport() {
    const lines = [
      "DR. PINGUIN \u00b7 Panel Pemilik",
      `Host: ${typeof window !== "undefined" ? window.location.hostname : ""}`,
      `Waktu: ${new Date().toLocaleString("id-ID")}`,
      `Online: ${stats?.online ?? stats?.count ?? 0}`,
      `Peak: ${stats?.peakToday ?? 0} (${stats?.peakDay || "\u2014"})`,
      `Views 24j: ${stats?.views24h ?? 0}`,
      `Storage: ${stats?.storage || "\u2014"}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setNote("Ringkasan tersalin.");
    } catch {
      setNote("Gagal menyalin.");
    }
  }

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
    setNote(null);
  }

  const online = stats?.online ?? stats?.count ?? null;
  const peak = stats?.peakToday ?? 0;
  const views24 = stats?.views24h ?? 0;
  const persistBroken = stats != null && (stats.persistOk === false || stats.storage === "memory");
  const avgHour = Math.round(views24 / 24);
  const devices = useMemo(() => {
    const list = stats?.devices || [];
    return hideBots ? list.filter((d) => d.device !== "bot") : list;
  }, [stats, hideBots]);
  const storageLabel =
    stats?.storage === "kv" ? "KV bound" : stats?.storage === "kv-rest" ? "KV REST" : "Memory";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.07),transparent_55%)]" />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Dr. Pinguin \u00b7 .com</p>
            <h1 className="mt-1 font-display text-3xl tracking-tight sm:text-4xl">Panel Pemilik</h1>
            <p className="mt-1 text-sm text-muted">Analitik live katalog \u2014 privat, noindex.</p>
          </div>
          <Link
            to="/"
            className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:border-foreground/30 hover:text-foreground"
          >
            \u2190 Katalog
          </Link>
        </header>

        {!authed ? (
          <form onSubmit={onSubmit} className="mx-auto w-full max-w-md rounded-3xl border border-border bg-surface/80 p-7 shadow-2xl backdrop-blur">
            <div className="mb-5 flex items-center gap-2 text-sm font-medium">
              <Shield className="size-4 text-emerald-400" />
              Masuk panel
            </div>
            <label className="mb-2 block text-sm" htmlFor="owner-key">
              Kunci pemilik
            </label>
            <p className="mb-4 text-xs leading-relaxed text-muted">
              Tempel ONLINE_VIEW_SECRET yang sama dengan env Cloudflare domain .com.
            </p>
            <Input id="owner-key" type="password" autoComplete="off" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" value={draft} onChange={(e) => setDraft(e.target.value)} className="mb-3 h-11" />
            {error ? <p className="mb-3 text-xs text-destructive">{error}</p> : null}
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? "Memeriksa\u2026" : "Masuk"}
            </Button>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/70 px-4 py-3 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                  Live {POLL_MS / 1000}s
                </span>
                <span className={`rounded-full border px-2 py-0.5 ${persistBroken ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>
                  {storageLabel}
                </span>
                {lastAt ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {lastAt.toLocaleTimeString("id-ID")}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void runSelfTest()} disabled={testing}>
                  <FlaskConical className={`size-3.5 ${testing ? "animate-pulse" : ""}`} /> Tes ping
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void copyReport()}>
                  <Copy className="size-3.5" /> Salin
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => void fetchStats(secret)} disabled={loading}>
                  <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>
            </div>

            {persistBroken ? (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
                Storage belum persist di .com. Bind KV ANALYTICS_KV atau isi env Cloudflare CF_ACCOUNT_ID + CF_KV_NAMESPACE_ID + CF_API_TOKEN, lalu redeploy Pages.
              </div>
            ) : null}
            {note ? <p className="text-xs text-muted">{note}</p> : null}

            <section className="grid gap-3 sm:grid-cols-3">
              <article className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                  <Users className="size-3.5" /> Online
                </div>
                <p className="mt-3 font-display text-5xl tabular-nums leading-none">{online === null ? "\u2014" : fmt(online)}</p>
                <p className="mt-2 text-[11px] text-muted">Heartbeat 20s \u00b7 TTL 60s</p>
              </article>
              <article className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                  <TrendingUp className="size-3.5" /> Peak hari ini
                </div>
                <p className="mt-3 font-display text-5xl tabular-nums leading-none">{fmt(peak)}</p>
                <p className="mt-2 text-[11px] text-muted">{stats?.peakDay || "\u2014"} WIB</p>
              </article>
              <article className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                  <Activity className="size-3.5" /> Views 24 jam
                </div>
                <p className="mt-3 font-display text-5xl tabular-nums leading-none">{fmt(views24)}</p>
                <p className="mt-2 text-[11px] text-muted">Rata-rata {fmt(avgHour)} / jam</p>
              </article>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <h2 className="mb-5 flex items-center gap-2 text-sm font-medium">
                <Activity className="size-4 text-emerald-400" /> Traffic per jam \u00b7 24 jam WIB
              </h2>
              <BarChart data={stats?.hourly || []} />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="mb-4 text-sm font-medium">Halaman teratas</h2>
                <RankList hrefPrefix="https://koleksidrpinguin.com" items={(stats?.topPaths || []).map((p) => ({ label: p.path, views: p.views }))} />
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="mb-4 text-sm font-medium">Referrer / origin</h2>
                <RankList items={(stats?.topRefs || []).map((r) => ({ label: r.ref, views: r.views }))} />
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-medium">
                    <Smartphone className="size-4" /> Perangkat
                  </h2>
                  <button type="button" className="text-[11px] text-muted underline-offset-2 hover:underline" onClick={() => setHideBots((v) => !v)}>
                    {hideBots ? "Tampilkan bot" : "Sembunyikan bot"}
                  </button>
                </div>
                <DeviceBar items={devices} />
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-medium">
                  <Globe className="size-4" /> Host
                </h2>
                <RankList items={(stats?.hosts || []).map((h) => ({ label: h.host, views: h.views }))} />
              </div>
            </section>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <Button type="button" variant="outline" size="sm" onClick={logout}>
                <LogOut className="size-3.5" /> Keluar
              </Button>
              <p className="flex items-center gap-1.5 text-[11px] text-muted">
                <EyeOff className="size-3.5" /> Sesi tab ini \u00b7 noindex \u00b7 koleksidrpinguin.com
              </p>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
