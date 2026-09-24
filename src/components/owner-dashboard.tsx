"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  Copy,
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
const CACHE_KEY = "drp_owner_stats_cache";
const BASE_POLL_MS = 30_000;
const MAX_POLL_MS = 120_000;
const HIDDEN_POLL_MS = 180_000;

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

type ConnState = "idle" | "ok" | "error" | "loading";

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

function loadCachedStats(): OwnerStats | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: OwnerStats };
    if (Date.now() - parsed.at > 10 * 60_000) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function saveCachedStats(data: OwnerStats) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* ignore */
  }
}

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

function fmtPeakDay(day?: string) {
  if (!day) return "-";
  try {
    const [y, m, d] = day.split("-").map(Number);
    if (!y || !m || !d) return day;
    return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return day;
  }
}

function HourChart({ data }: { data: { hour: string; views: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.views));
  const nowH = new Date(Date.now() + 7 * 3600_000).toISOString().slice(11, 13) + ":00";
  const peak = data.reduce((a, b) => (b.views > a.views ? b : a), { hour: "-", views: 0 });

  return (
    <div>
      <div className="flex h-36 items-end gap-px sm:gap-0.5" role="img" aria-label="Traffic 24 jam">
        {data.map((d) => {
          const isNow = d.hour === nowH;
          const isPeak = d.hour === peak.hour && peak.views > 0;
          const h = Math.max(d.views <= 0 ? 3 : 6, (d.views / max) * 100);
          return (
            <div key={d.hour} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end">
              <div
                className={`w-full rounded-sm transition-[height,background-color] duration-300 ${
                  d.views <= 0
                    ? "bg-white/[0.04]"
                    : isNow
                      ? "bg-emerald-400"
                      : isPeak
                        ? "bg-emerald-300/90"
                        : "bg-emerald-500/55 group-hover:bg-emerald-400/90"
                }`}
                style={{ height: `${h}%` }}
                title={`${d.hour} - ${fmt(d.views)}`}
              />
              <span
                className={`mt-1.5 hidden text-[9px] tabular-nums sm:block ${
                  isNow ? "text-emerald-400" : "text-zinc-600"
                }`}
              >
                {d.hour.slice(0, 2)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span>
          Peak jam <strong className="text-zinc-300">{peak.hour}</strong> ({fmt(peak.views)})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-sm bg-emerald-400" /> jam ini
        </span>
      </div>
    </div>
  );
}

function RankList({ items }: { items: { label: string; views: number }[] }) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-white/[0.06] px-4 py-10 text-center">
        <p className="text-xs text-zinc-500">Belum ada data. Buka katalog di tab lain.</p>
      </div>
    );
  }
  const max = Math.max(1, ...items.map((i) => i.views));
  const sum = items.reduce((s, i) => s + i.views, 0) || 1;
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`} className="text-xs">
          <div className="mb-1 flex justify-between gap-2">
            <span className="truncate text-zinc-200" title={item.label}>
              <span className="mr-1.5 tabular-nums text-zinc-600">{String(i + 1).padStart(2, "0")}</span>
              {item.label || "/"}
            </span>
            <span className="shrink-0 tabular-nums text-zinc-500">
              {fmt(item.views)}
              <span className="ml-1 text-[10px] text-zinc-600">{Math.round((item.views / sum) * 100)}%</span>
            </span>
          </div>
          <div className="h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-emerald-500/70"
              style={{ width: `${(item.views / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeviceBar({ items }: { items: { device: string; views: number }[] }) {
  const total = items.reduce((s, d) => s + d.views, 0);
  if (!total) return <p className="text-xs text-zinc-500">Belum ada data perangkat.</p>;
  const colors: Record<string, string> = {
    mobile: "bg-emerald-400",
    desktop: "bg-sky-400",
    tablet: "bg-amber-400",
    bot: "bg-zinc-500",
    other: "bg-violet-400",
  };
  return (
    <div className="space-y-3">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        {items.map((d) => (
          <div
            key={d.device}
            className={colors[d.device] || "bg-zinc-600"}
            style={{ width: `${(d.views / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2 text-xs">
        {items.map((d) => (
          <li key={d.device} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 capitalize text-zinc-500">
              <span className={`size-1.5 rounded-full ${colors[d.device] || "bg-zinc-600"}`} />
              {d.device}
            </span>
            <span className="tabular-nums text-zinc-300">
              {fmt(d.views)} · {Math.round((d.views / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Toast({
  message,
  variant,
  onDone,
}: {
  message: string;
  variant: "ok" | "err" | "info";
  onDone: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(t);
  }, [message, onDone]);

  const border =
    variant === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
      : variant === "err"
        ? "border-red-500/30 bg-red-500/10 text-red-100"
        : "border-white/10 bg-zinc-900/95 text-zinc-200";

  return (
    <div
      className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-xs shadow-2xl backdrop-blur-md ${border}`}
      role="status"
    >
      {message}
    </div>
  );
}

export function OwnerDashboard() {
  const [secret, setSecret] = useState("");
  const [draft, setDraft] = useState("");
  const [stats, setStats] = useState<OwnerStats | null>(() => loadCachedStats());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [conn, setConn] = useState<ConnState>("idle");
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [authed, setAuthed] = useState(false);
  const [toast, setToast] = useState<{ msg: string; variant: "ok" | "err" | "info" } | null>(null);
  const [hideBots, setHideBots] = useState(true);

  const pollMsRef = useRef(BASE_POLL_MS);
  const timerRef = useRef<number | null>(null);
  const visibleRef = useRef(true);

  useEffect(() => {
    const s = loadSecret();
    if (s) {
      setSecret(s);
      setAuthed(true);
    }
  }, []);

  const showToast = useCallback((msg: string, variant: "ok" | "err" | "info" = "info") => {
    setToast({ msg, variant });
  }, []);

  const fetchStats = useCallback(async (key: string, opts?: { quiet?: boolean }) => {
    if (!key) return;
    if (!opts?.quiet) setLoading(true);
    setConn("loading");
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
        setConn("error");
        const msg =
          data.error === "not_configured"
            ? data.hint || "ONLINE_VIEW_SECRET belum di-set di Cloudflare."
            : data.error === "forbidden"
              ? "Kunci salah."
              : "Gagal ambil data.";
        setError(msg);
        saveSecret("");
        setSecret("");
        pollMsRef.current = Math.min(MAX_POLL_MS, pollMsRef.current * 1.5);
        return;
      }
      setAuthed(true);
      setStats(data);
      saveCachedStats(data);
      setLastAt(new Date());
      setConn("ok");
      saveSecret(key);
      setSecret(key);
      pollMsRef.current = BASE_POLL_MS;
    } catch {
      setConn("error");
      if (!opts?.quiet) setError("Jaringan error.");
      pollMsRef.current = Math.min(MAX_POLL_MS, pollMsRef.current * 2);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authed || !secret) return;

    const clear = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const schedule = () => {
      clear();
      const delay = visibleRef.current ? pollMsRef.current : HIDDEN_POLL_MS;
      timerRef.current = window.setTimeout(() => {
        void fetchStats(secret, { quiet: true }).then(schedule);
      }, delay);
    };

    void fetchStats(secret).then(schedule);

    const onVis = () => {
      visibleRef.current = document.visibilityState === "visible";
      if (visibleRef.current) {
        pollMsRef.current = BASE_POLL_MS;
        void fetchStats(secret, { quiet: true });
        schedule();
      } else {
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [authed, secret, fetchStats]);

  async function runSelfTest() {
    if (!secret) return;
    setTesting(true);
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
      await fetchStats(secret, { quiet: true });
      if (pingData.persistOk === false || pingData.storage === "memory") {
        showToast("Ping OK, storage masih memory - cek binding KV.", "info");
        setConn("error");
      } else {
        showToast("Koneksi OK - beacon tercatat.", "ok");
        setConn("ok");
      }
    } catch {
      showToast("Tes gagal - /api/online tidak merespons.", "err");
      setConn("error");
    } finally {
      setTesting(false);
    }
  }

  async function copyReport() {
    const lines = [
      "DR. PINGUIN - Panel Pemilik",
      `Host: ${typeof window !== "undefined" ? window.location.hostname : ""}`,
      `Waktu: ${new Date().toLocaleString("id-ID")}`,
      `Online: ${stats?.online ?? stats?.count ?? 0}`,
      `Peak: ${stats?.peakToday ?? 0} (${stats?.peakDay || "-"})`,
      `Views 24j: ${stats?.views24h ?? 0}`,
      `Storage: ${stats?.storage || "-"}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      showToast("Ringkasan tersalin.", "ok");
    } catch {
      showToast("Gagal menyalin.", "err");
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
    setConn("idle");
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
    stats?.storage === "kv" ? "KV" : stats?.storage === "kv-rest" ? "KV REST" : "Memory";

  const connDot =
    conn === "ok"
      ? "bg-emerald-400"
      : conn === "error"
        ? "bg-red-400"
        : conn === "loading"
          ? "bg-amber-400 animate-pulse"
          : "bg-zinc-600";

  const emptyHours = useMemo(
    () => Array.from({ length: 24 }, (_, i) => ({ hour: `${String(i).padStart(2, "0")}:00`, views: 0 })),
    [],
  );

  return (
    <div className="min-h-dvh text-zinc-100" style={{ backgroundColor: "#0f0f11" }}>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.08),transparent)]" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Dr. Pinguin</p>
            <h1 className="mt-1 font-display text-2xl tracking-tight text-zinc-50 sm:text-3xl">Panel Pemilik</h1>
            <p className="mt-1 text-sm text-zinc-500">Analitik live - privat, hemat request.</p>
          </div>
          <Link
            to="/"
            className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-zinc-500 transition hover:border-white/20 hover:text-zinc-200"
          >
            Katalog
          </Link>
        </header>

        {!authed ? (
          <form
            onSubmit={onSubmit}
            className="mx-auto w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#141416] p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Shield className="size-4 text-emerald-400" />
              Masuk panel
            </div>
            <label className="mb-1.5 block text-sm text-zinc-400" htmlFor="owner-key">
              Kunci pemilik
            </label>
            <p className="mb-3 text-xs leading-relaxed text-zinc-500">
              ONLINE_VIEW_SECRET dari env Cloudflare (.com).
            </p>
            <Input
              id="owner-key"
              type="password"
              autoComplete="off"
              placeholder="Tempel kunci..."
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
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#141416]/90 px-3 py-2.5 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.06] px-2 py-0.5">
                  <span className={`size-1.5 rounded-full ${connDot}`} />
                  {conn === "ok" ? "Live" : conn === "loading" ? "Sync" : conn === "error" ? "Error" : "Idle"}
                </span>
                <span
                  className={`rounded-md border px-2 py-0.5 ${
                    persistBroken
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-200/90"
                      : "border-white/[0.06] text-zinc-400"
                  }`}
                >
                  {storageLabel}
                </span>
                {lastAt ? (
                  <span className="tabular-nums text-zinc-600">
                    {lastAt.toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-white/[0.08] bg-transparent text-xs"
                  onClick={() => void runSelfTest()}
                  disabled={testing}
                >
                  <span className={`size-1.5 rounded-full ${connDot}`} />
                  <FlaskConical className={`size-3.5 ${testing ? "animate-pulse" : ""}`} />
                  Tes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-white/[0.08] bg-transparent text-xs"
                  onClick={() => void copyReport()}
                >
                  <Copy className="size-3.5" />
                  Salin
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => void fetchStats(secret)}
                  disabled={loading}
                >
                  <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {persistBroken ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5 text-xs text-amber-100/90">
                Storage belum persist. Pastikan binding ANALYTICS_KV aktif, lalu redeploy.
              </div>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-3">
              <article className="rounded-2xl border border-white/[0.06] bg-[#141416] p-5">
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  <Users className="size-3.5" />
                  Online sekarang
                </div>
                <p className="mt-3 font-display text-4xl tabular-nums leading-none tracking-tight text-zinc-50 sm:text-5xl">
                  {online === null ? "-" : fmt(online)}
                </p>
                <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                  </span>
                  Live
                </p>
              </article>

              <article className="rounded-2xl border border-white/[0.06] bg-[#141416] p-5">
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  <TrendingUp className="size-3.5" />
                  Peak hari ini
                </div>
                <p className="mt-3 font-display text-4xl tabular-nums leading-none tracking-tight text-zinc-50 sm:text-5xl">
                  {fmt(peak)}
                </p>
                <p className="mt-2.5 text-[11px] text-zinc-500">{fmtPeakDay(stats?.peakDay)}</p>
              </article>

              <article className="rounded-2xl border border-white/[0.06] bg-[#141416] p-5">
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  <Activity className="size-3.5" />
                  Views 24 jam
                </div>
                <p className="mt-3 font-display text-4xl tabular-nums leading-none tracking-tight text-zinc-50 sm:text-5xl">
                  {fmt(views24)}
                </p>
                <p className="mt-2.5 text-[11px] text-zinc-500">Rata-rata {fmt(avgHour)} / jam</p>
              </article>
            </section>

            <section className="rounded-2xl border border-white/[0.06] bg-[#141416] p-5 sm:p-6">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-200">
                <Activity className="size-4 text-emerald-400" />
                Traffic per jam · 24 jam WIB
              </h2>
              <HourChart data={stats?.hourly?.length ? stats.hourly : emptyHours} />
            </section>

            <section className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.06] bg-[#141416] p-5">
                <h2 className="mb-4 text-sm font-medium text-zinc-200">Halaman teratas</h2>
                <RankList items={(stats?.topPaths || []).map((p) => ({ label: p.path, views: p.views }))} />
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-[#141416] p-5">
                <h2 className="mb-4 text-sm font-medium text-zinc-200">Referrer / origin</h2>
                <RankList items={(stats?.topRefs || []).map((r) => ({ label: r.ref, views: r.views }))} />
              </div>
            </section>

            <section className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.06] bg-[#141416] p-5">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                    <Smartphone className="size-4" />
                    Perangkat
                  </h2>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-500">
                    <input
                      type="checkbox"
                      checked={hideBots}
                      onChange={(e) => setHideBots(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Sembunyikan bot
                  </label>
                </div>
                <DeviceBar items={devices} />
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-[#141416] p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <Globe className="size-4" />
                  Host
                </h2>
                <RankList items={(stats?.hosts || []).map((h) => ({ label: h.host, views: h.views }))} />
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-white/[0.08] bg-transparent text-xs"
                onClick={logout}
              >
                <LogOut className="size-3.5" />
                Keluar
              </Button>
              <p className="text-[11px] text-zinc-600">
                Tab hidden = poll 3 menit · cache localStorage 10 menit · noindex
              </p>
            </div>
          </>
        )}
      </div>

      {toast ? <Toast message={toast.msg} variant={toast.variant} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
