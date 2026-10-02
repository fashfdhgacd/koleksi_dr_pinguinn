"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OwnerTools } from "@/components/owner-tools";

const SECRET_KEY = "drp_owner_secret";
const SECRET_LEGACY = "drp_online_secret";
const POLL_MS = 25_000;

type DeviceKind = "mobile" | "desktop" | "tablet" | "bot" | "other";

type DayRow = {
  day: string;
  views: number;
  unique: number;
  peak: number;
};

type OwnerStats = {
  ok?: boolean;
  owner?: boolean;
  error?: string;
  hint?: string;
  online?: number;
  count?: number;
  peakToday?: number;
  viewsToday?: number;
  views24h?: number;
  uniqueToday?: number;
  views7d?: number;
  yesterdayViews?: number;
  yesterdayUnique?: number;
  days?: DayRow[];
  topPaths?: { path: string; views: number }[];
  topRefs?: { ref: string; views: number }[];
  devices?: { device: DeviceKind; views: number }[];
  persistOk?: boolean;
  presence?: "memory" | "kv" | "postgres" | "hybrid";
  updatedAt?: string;
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

function fmt(n: number | null | undefined): string {
  return Math.max(0, Number(n) || 0).toLocaleString("id-ID");
}

function deviceLabel(d: DeviceKind): string {
  if (d === "mobile") return "HP";
  if (d === "desktop") return "Desktop";
  if (d === "tablet") return "Tablet";
  if (d === "bot") return "Bot";
  return "Lainnya";
}

function presenceLabel(p?: OwnerStats["presence"]): string {
  if (p === "hybrid" || p === "postgres") return "Sesi nyata (server)";
  if (p === "kv") return "Sesi nyata (KV)";
  return "Sesi isolate ini";
}

function dayLabel(iso: string, index: number): string {
  if (index === 0) return "Hari ini";
  if (index === 1) return "Kemarin";
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function deltaPct(now: number, prev: number): string | null {
  if (!prev && !now) return null;
  if (!prev) return "baru";
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

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
          <form onSubmit={onSubmit} className="rounded-2xl border border-white/[0.08] bg-[#141416] p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Shield className="size-4 text-emerald-400" />
              Masuk panel
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
          <>
            <section className="rounded-2xl border border-white/[0.08] bg-[#141416] px-6 py-8 text-center">
              <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                </span>
                Sedang di situs
              </div>
              <p className="mt-3 font-display text-7xl tabular-nums leading-none text-zinc-50">{fmt(online)}</p>
              <p className="mt-3 text-sm text-zinc-500">tab aktif manusia ±2 menit</p>
              <p className="mt-2 text-[11px] text-zinc-600">
                {presenceLabel(stats?.presence)}
                {tickAt ? ` · update ${new Date(tickAt).toLocaleTimeString("id-ID")}` : ""}
              </p>
              {stats?.hint ? <p className="mt-3 text-xs text-amber-400/90">{stats.hint}</p> : null}
              {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
            </section>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Unik hari ini" value={fmt(stats?.uniqueToday)} hint={vsUniq} />
              <Stat label="Tayang hari ini" value={fmt(stats?.viewsToday)} hint={vsViews} />
              <Stat label="Kemarin" value={fmt(stats?.yesterdayViews)} />
              <Stat label="7 hari" value={fmt(stats?.views7d)} />
            </section>

            <OwnerTools secret={secret} />

            {days.length ? (
              <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Riwayat 14 hari</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-[11px] uppercase tracking-wide text-zinc-600">
                      <tr>
                        <th className="pb-2 font-medium">Hari</th>
                        <th className="pb-2 text-right font-medium">Tayang</th>
                        <th className="pb-2 text-right font-medium">Unik</th>
                        <th className="pb-2 text-right font-medium">Puncak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((row, i) => (
                        <tr key={row.day} className="border-t border-white/[0.06]">
                          <td className="py-2 text-zinc-300">
                            {dayLabel(row.day, i)}
                            <span className="ml-2 text-[11px] text-zinc-600">{row.day}</span>
                          </td>
                          <td className="py-2 text-right tabular-nums text-zinc-200">{fmt(row.views)}</td>
                          <td className="py-2 text-right tabular-nums text-zinc-400">{fmt(row.unique)}</td>
                          <td className="py-2 text-right tabular-nums text-zinc-400">{fmt(row.peak)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[11px] text-zinc-600">
                  Data sebelum deploy ini bisa kosong. Mulai hari ini tersimpan 90 hari.
                </p>
              </section>
            ) : null}

            {devices.length ? (
              <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Perangkat hari ini (WIB)</h2>
                <ul className="mt-3 space-y-2">
                  {devices.map((d) => (
                    <li key={d.device} className="flex items-center gap-3 text-sm">
                      <span className="w-16 shrink-0 text-zinc-400">{deviceLabel(d.device)}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <span className="block h-full rounded-full bg-emerald-400/80" style={{ width: `${d.pct}%` }} />
                      </span>
                      <span className="w-10 text-right tabular-nums text-zinc-300">{d.pct}%</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {stats?.topPaths?.length ? (
              <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Halaman hari ini (WIB)</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {stats.topPaths.slice(0, 8).map((row) => (
                    <li key={row.path} className="flex justify-between gap-3">
                      <span className="truncate text-zinc-300">{row.path}</span>
                      <span className="tabular-nums text-zinc-500">{fmt(row.views)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {stats?.topRefs?.length ? (
              <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Sumber hari ini (WIB)</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {stats.topRefs.slice(0, 6).map((row) => (
                    <li key={row.ref} className="flex justify-between gap-3">
                      <span className="truncate text-zinc-300">{row.ref}</span>
                      <span className="tabular-nums text-zinc-500">{fmt(row.views)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-zinc-600">Ping pengunjung 90 dtk · panel refresh 25 dtk · tab tersembunyi tidak dihitung</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void fetchOnline(secret)} disabled={loading}>
                  {loading ? "..." : "Refresh"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={logout}>
                  Keluar
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  const up = hint && hint.startsWith("+");
  const down = hint && hint.startsWith("-");
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#141416] px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-2 font-display text-2xl tabular-nums text-zinc-50">{value}</p>
      {hint ? (
        <p className={`mt-1 text-[11px] ${up ? "text-emerald-400" : down ? "text-red-400" : "text-zinc-600"}`}>
          vs kemarin {hint}
        </p>
      ) : null}
    </div>
  );
}
