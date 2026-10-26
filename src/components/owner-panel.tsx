"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  loadSecret,
  saveSecret,
  ownerToast,
  OwnerToaster,
  wibHourMinute,
  fmt,
  type OwnerStats,
} from "@/components/owner-dashboard-shared";
import { OwnerLoginForm } from "@/components/owner-login-form";
import { OwnerOverview } from "@/components/owner-overview";
import { OwnerTools } from "@/components/owner-tools";
import { OwnerVideyUntitled } from "@/components/owner-videy-untitled";
import { OwnerAuthedBottom } from "@/components/owner-authed-bottom";
import { HiddenListSection } from "@/components/owner-hidden-list";
import { DetectorReviewSection } from "@/components/owner-detector-review";
import { OwnerTelegramStatus } from "@/components/owner-telegram-status";
import { OwnerTrafficStars } from "@/components/owner-trafficstars";
import type { PlayerLogData } from "@/components/owner-health";
import { Button } from "@/components/ui/button";

/**
 * /pemilik. Cloudflare cost: NO interval polling. Everything loads once when the panel opens (after
 * the key) and on the Refresh button. No visibility or timer reloads. The owner key stays in this tab's sessionStorage only (gone when the tab
 * closes) and is sent as a header, never in a URL.
 */
export function OwnerDashboard() {
  const [secret, setSecret] = useState("");
  const [draft, setDraft] = useState("");
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [tickAt, setTickAt] = useState<number>(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [playerLog, setPlayerLog] = useState<PlayerLogData | null>(null);
  const [playerBusy, setPlayerBusy] = useState(false);
  const lastLoadRef = useRef(0);

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
      ownerToast("Gagal memuat statistik: koneksi bermasalah.", "error", { label: "Coba lagi", run: () => void fetchOnline(key) });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlayerLog = useCallback(async (key: string) => {
    if (!key) return;
    setPlayerBusy(true);
    try {
      const res = await fetch("/api/player-log", { headers: { "x-online-key": key }, cache: "no-store" });
      const d = (await res.json().catch(() => null)) as PlayerLogData | null;
      if (!d || d.error) {
        // Wrong key: the login form already says "Kunci salah."; no extra toast.
        if (d?.error === "forbidden") return;
        ownerToast(`Gagal memuat Kesehatan player: ${d?.error || `HTTP ${res.status}`}`, "error", {
          label: "Coba lagi",
          run: () => void loadPlayerLog(key),
        });
        setPlayerLog((cur) => cur || { hosts: [] });
        return;
      }
      setPlayerLog(d);
    } catch {
      ownerToast("Gagal memuat Kesehatan player: koneksi bermasalah.", "error", { label: "Coba lagi", run: () => void loadPlayerLog(key) });
      setPlayerLog((cur) => cur || { hosts: [] });
    } finally {
      setPlayerBusy(false);
    }
  }, []);

  /** One full load: stats, player health, and (via reloadKey) the catalog overview + thumbnail list. */
  const refreshAll = useCallback(
    (key: string, quiet = false, reloadChildren = true) => {
      if (!key) return;
      lastLoadRef.current = Date.now();
      void fetchOnline(key, quiet);
      void loadPlayerLog(key);
      // The overview and thumbnail list load by themselves when they mount (panel open).
      if (reloadChildren) setReloadKey((n) => n + 1);
    },
    [fetchOnline, loadPlayerLog],
  );

  useEffect(() => {
    const s = loadSecret();
    if (s) {
      setSecret(s);
      setAuthed(true);
    }
  }, []);

  // Panel open (after the key): load once. No interval.
  const openedFor = useRef("");
  useEffect(() => {
    if (!authed || !secret || openedFor.current === secret) return;
    openedFor.current = secret;
    refreshAll(secret, false, false);
  }, [authed, secret, refreshAll]);

  // No visibilitychange/interval reload: data loads on open and on the Refresh button only.

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = draft.trim();
    if (key.length < 8) {
      setError("Kunci minimal 8 karakter.");
      return;
    }
    setSecret(key);
    setAuthed(true);
  }

  function logout() {
    saveSecret("");
    setSecret("");
    setAuthed(false);
    setStats(null);
    setPlayerLog(null);
    setDraft("");
    setError(null);
    openedFor.current = "";
  }

  const [botOk, setBotOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!authed || !secret) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/owner-tools", {
          method: "POST",
          headers: { "content-type": "application/json", "x-online-key": secret },
          body: JSON.stringify({ action: "telegram-webhook-info" }),
        });
        const d = (await res.json().catch(() => null)) as {
          ok?: boolean;
          urlOk?: boolean;
          info?: { lastErrorMessage?: string | null; lastErrorDate?: string | null } | null;
        } | null;
        // Telegram keeps the last delivery error for good; only an error in the last hour counts.
        const errAt = Date.parse(String(d?.info?.lastErrorDate || ""));
        const freshError = Boolean(d?.info?.lastErrorMessage) && (!Number.isFinite(errAt) || Date.now() - errAt < 3600_000);
        if (alive) setBotOk(Boolean(d?.ok && d.urlOk && d.info && !freshError));
      } catch {
        if (alive) setBotOk(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authed, secret]);

  const [pushOk, setPushOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!authed || !secret) return;
    let alive = true;
    void fetch("/api/push", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d: { ok?: boolean; publicKey?: string } | null) => {
        if (alive) setPushOk(Boolean(d?.ok && d.publicKey));
      })
      .catch(() => alive && setPushOk(false));
    return () => {
      alive = false;
    };
  }, [authed, secret, reloadKey]);

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
  const lastText = wibHourMinute(tickAt);

  const [tab, setTab] = useState<Tab>("ringkasan");
  const [seen, setSeen] = useState<Record<Tab, boolean>>({ ringkasan: true, cek: true, video: false, pengaturan: false });
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const onReviewCount = useCallback((n: number) => setReviewCount(n), []);

  function goTab(t: Tab) {
    setTab(t);
    setSeen((s) => (s[t] ? s : { ...s, [t]: true }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showGone() {
    goTab("video");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("drp-owner-open", { detail: "player-error" }));
      document.getElementById("collapse-player-error")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  const spark = days
    .slice()
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((d) => Number(d.views) || 0);
  const kpis: { label: string; value: number; sub: string; series?: number[] }[] = [
    { label: "Online sekarang", value: online, sub: `puncak hari ini ${fmt(stats?.peakToday)}` },
    { label: "Kunjungan hari ini", value: stats?.viewsToday || 0, sub: `kemarin ${fmt(stats?.yesterdayViews)}`, series: spark },
    { label: "Pengunjung unik hari ini", value: stats?.uniqueToday || 0, sub: `kemarin ${fmt(stats?.yesterdayUnique)}`, series: days.slice().sort((a, b) => (a.day < b.day ? -1 : 1)).map((d) => Number(d.unique) || 0) },
    { label: "Kunjungan 7 hari", value: stats?.views7d || 0, sub: "kunjungan halaman", series: spark.slice(-7) },
  ];

  const tabs: { id: Tab; label: string; icon: string; badge?: number | null }[] = [
    { id: "ringkasan", label: "Ringkasan", icon: "◧" },
    { id: "cek", label: "Perlu dicek", icon: "⚑", badge: reviewCount },
    { id: "video", label: "Video", icon: "▶" },
    { id: "pengaturan", label: "Pengaturan", icon: "⚙" },
  ];

  if (!authed) {
    return (
      <div className="min-h-dvh text-zinc-100 antialiased" style={shellStyle}>
        <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-14">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#2dd4bf]/15 text-lg font-bold text-[#2dd4bf]">P</span>
            <div>
              <h1 className="text-xl font-semibold text-zinc-50">Panel Pemilik</h1>
              <p className="text-[13px] text-zinc-500">Dr. Pinguin</p>
            </div>
          </div>
          <div className={glass + " p-5"}>
            <OwnerLoginForm draft={draft} setDraft={setDraft} error={error} loading={loading} onSubmit={onSubmit} />
          </div>
          <Link to="/" className="text-center text-[13px] text-zinc-500 hover:text-zinc-300">
            ← Kembali ke katalog
          </Link>
        </div>
        <OwnerToaster />
      </div>
    );
  }

  const show = (t: Tab) => (tab === t ? "flex" : "hidden");

  return (
    <div className="min-h-dvh text-zinc-100 antialiased" style={shellStyle}>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/[0.06] bg-black/30 px-3 py-5 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-xl bg-[#2dd4bf]/15 font-bold text-[#2dd4bf]">P</span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-zinc-50">Panel Pemilik</p>
            <p className="text-[12px] text-zinc-500">Dr. Pinguin</p>
          </div>
        </div>
        <nav className="mt-7 flex flex-col gap-1" aria-label="Menu pemilik">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => goTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${focusRing} ${
                tab === t.id ? "bg-[#2dd4bf]/12 font-medium text-[#5eead4]" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
              }`}
            >
              <span className="w-4 text-center" aria-hidden="true">{t.icon}</span>
              <span className="flex-1">{t.label}</span>
              <Badge n={t.badge} />
            </button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 px-1">
          <div className="flex flex-wrap gap-1.5">
            <Pill ok={botOk} label={botOk == null ? "Bot ..." : botOk ? "Bot aktif" : "Bot perlu dicek"} />
            <Pill ok={pushOk} label={pushOk == null ? "Push ..." : pushOk ? "Push siap" : "Push mati"} />
          </div>
          <Link to="/" className="rounded-xl px-3 py-2 text-[13px] text-zinc-500 hover:text-zinc-200">
            ← Katalog
          </Link>
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#08090a]/75 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-lg font-semibold text-zinc-50">{tabs.find((t) => t.id === tab)?.label}</h1>
              <p className="text-[12px] text-zinc-500">
                {lastText ? `Diperbarui ${lastText} WIB` : loading ? "Memuat…" : "Belum dimuat"},{" "}
                <span className="text-[#5eead4]">● {fmt(online)} sedang online</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" className={headBtnPrimary} onClick={() => refreshAll(secret)} disabled={loading}>
                {loading ? "Memuat…" : "↻ Muat ulang"}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-3 pb-28 pt-4 sm:px-4 lg:pb-10">
          {/* RINGKASAN */}
          <section className={`${show("ringkasan")} flex-col gap-3 sm:gap-4`}>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
              {kpis.map((k) => (
                <div key={k.label} className={glass + " relative overflow-hidden p-4"}>
                  <p className="truncate text-[11px] font-medium uppercase tracking-wide text-zinc-500">{k.label}</p>
                  <p className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums tracking-tight text-zinc-50 sm:text-[30px]">
                    {fmt(k.value)}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-zinc-500">{k.sub}</p>
                  {k.series && k.series.length > 1 ? <Sparkline values={k.series} /> : null}
                </div>
              ))}
            </div>
            {reviewCount ? (
              <button
                type="button"
                onClick={() => goTab("cek")}
                className={`flex items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-left ${focusRing}`}
              >
                <span className="text-sm text-amber-100">
                  <span className="font-semibold">{fmt(reviewCount)} judul</span> perlu kamu cek (detector minor)
                </span>
                <span className="text-amber-300" aria-hidden="true">›</span>
              </button>
            ) : null}
            <OwnerOverview
              secret={secret}
              online={online}
              stats={stats}
              days={days}
              devices={devices}
              tickAt={tickAt}
              error={error}
              reloadKey={reloadKey}
              playerLog={playerLog}
              botOk={botOk}
              onShowGone={showGone}
            />
            <OwnerTrafficStars reloadKey={reloadKey} />
            <OwnerAuthedBottom
              days={days}
              devices={devices}
              stats={stats}
              secret={secret}
              loading={loading}
              fetchOnline={fetchOnline}
              logout={logout}
            />
          </section>

          {/* PERLU DICEK: selalu dimuat sekali (untuk angka badge), tidak ada polling. */}
          <section className={`${show("cek")} flex-col gap-4`}>
            <div className={glass + " p-4"}>
              <DetectorReviewSection key={reloadKey} secret={secret} onCount={onReviewCount} />
            </div>
          </section>

          {/* VIDEO */}
          {seen.video ? (
            <section className={`${show("video")} flex-col gap-4`}>
              <Group title="Kelola video">
                <Collapse id="tools" title="Tambah video dan ambil link">
                  <OwnerTools secret={secret} />
                </Collapse>
                <Collapse id="player-error" title="Player error (detail + sembunyikan)">
                  <PlayerErrorsSection secret={secret} data={playerLog} busy={playerBusy} reload={() => loadPlayerLog(secret)} />
                </Collapse>
                <Collapse id="hidden" title="Video disembunyikan">
                  <HiddenListSection secret={secret} />
                </Collapse>
              </Group>
              <Group title="Rapikan katalog">
                <Collapse id="videy" title="Videy belum dikasih judul">
                  <OwnerVideyUntitled secret={secret} />
                </Collapse>
                <Collapse id="poster" title="Poster video">
                  <OwnerTools secret={secret} part="poster" />
                </Collapse>
              </Group>
              <p className="px-1 text-[12px] text-zinc-500">Cari dan edit video ada di tab Ringkasan, bagian Upload terbaru.</p>
            </section>
          ) : null}

          {/* PENGATURAN */}
          {seen.pengaturan ? (
            <section className={`${show("pengaturan")} flex-col gap-4`}>
              <Group title="Status">
                <StatusRow label="Bot Telegram" ok={botOk} text={botOk == null ? "Mengecek…" : botOk ? "Aktif" : "Perlu dicek"} />
                <StatusRow label="Notifikasi push" ok={pushOk} text={pushOk == null ? "Mengecek…" : pushOk ? "Siap (kunci VAPID ada)" : "Mati"} />
                <StatusRow label="Pengunjung online" ok text={fmt(online)} />
              </Group>
              <Group title="Bot">
                <Collapse id="bot" title="Bot Telegram (detail)">
                  <OwnerTelegramStatus secret={secret} />
                </Collapse>
              </Group>
              <Group title="Akun">
                <Link to="/" className={`flex items-center justify-between px-4 py-3 text-sm text-zinc-200 hover:bg-white/[0.03] ${focusRing}`}>
                  Buka katalog <span className="text-zinc-500">›</span>
                </Link>
                <button type="button" onClick={logout} className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm text-red-300 hover:bg-white/[0.03] ${focusRing}`}>
                  Keluar <span className="text-zinc-500">›</span>
                </button>
              </Group>
            </section>
          ) : null}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#0b0c0d]/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        aria-label="Menu pemilik"
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => goTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${focusRing} ${tab === t.id ? "text-[#5eead4]" : "text-zinc-500"}`}
            >
              <span className="text-lg leading-none" aria-hidden="true">{t.icon}</span>
              {t.label}
              {t.badge ? (
                <span className="absolute right-[18%] top-1.5">
                  <Badge n={t.badge} />
                </span>
              ) : null}
              {tab === t.id ? <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-[#2dd4bf]" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </nav>
      <OwnerToaster />
    </div>
  );
}

type Tab = "ringkasan" | "cek" | "video" | "pengaturan";

const shellStyle: React.CSSProperties = {
  backgroundColor: "#08090a",
  backgroundImage: "radial-gradient(900px 420px at 85% -10%, rgba(45,212,191,0.10), transparent 60%), radial-gradient(700px 360px at -10% 0%, rgba(45,212,191,0.05), transparent 60%)",
  backgroundAttachment: "fixed",
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};
// Tanpa backdrop-blur: lebih ringan di HP dan tidak menjebak elemen `fixed` di dalam kartu.
const glass = "rounded-xl border border-white/[0.07] bg-[#101214] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]";
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2dd4bf]";

function Badge({ n }: { n?: number | null }) {
  if (!n) return null;
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold leading-5 text-zinc-950 tabular-nums">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Garis tren kecil (tanpa persen), dari data harian yang sudah dimuat; tidak ada request tambahan. */
function Sparkline({ values }: { values: number[] }) {
  const w = 120;
  const h = 32;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-3 h-8 w-full" aria-hidden="true">
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="rgba(45,212,191,0.12)" />
      <polyline points={pts} fill="none" stroke="#2dd4bf" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className={glass + " divide-y divide-white/[0.06] overflow-hidden"}>{children}</div>
    </div>
  );
}

function StatusRow({ label, ok, text }: { label: string; ok: boolean | null; text: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="text-zinc-300">{label}</span>
      <span className="flex items-center gap-2 text-zinc-400">
        <span className={`size-2 rounded-full ${ok == null ? "bg-zinc-600" : ok ? "bg-[#2dd4bf]" : "bg-amber-400"}`} />
        {text}
      </span>
    </div>
  );
}
const headBtnPrimary =
  "whitespace-nowrap rounded-lg border border-[#2dd4bf] bg-[#2dd4bf] px-3 py-1.5 text-[13px] font-medium text-zinc-950 transition hover:bg-[#5eead4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2dd4bf] disabled:opacity-50";

function Pill({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[12px] text-zinc-300">
      <span className={`size-1.5 rounded-full ${ok == null ? "bg-zinc-600" : ok ? "bg-[#2dd4bf]" : "bg-amber-400"}`} />
      {label}
    </span>
  );
}

/**
 * Collapsed-by-default block for less used owner sections. Content mounts only when opened.
 * Another part of the panel can open it with a "drp-owner-open" event naming its id.
 */
function Collapse({
  id,
  title,
  children,
  accent = "teal",
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  accent?: "teal" | "amber";
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail === id) setOpen(true);
    };
    window.addEventListener("drp-owner-open", onOpen);
    return () => window.removeEventListener("drp-owner-open", onOpen);
  }, [id]);
  return (
    <div id={`collapse-${id}`} className="scroll-mt-24">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-zinc-100 transition hover:bg-white/[0.03] ${focusRing}`}
      >
        <span className="flex items-center gap-2.5">
          <span className={`size-2 rounded-full ${accent === "amber" ? "bg-amber-400" : "bg-[#2dd4bf]"}`} aria-hidden="true" />
          {title}
        </span>
        <span className={`text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
          ›
        </span>
      </button>
      {open ? <div className="border-t border-white/[0.06] bg-black/20 p-2 sm:p-3">{children}</div> : null}
    </div>
  );
}

type PlayerErrorRow = {
  id: string;
  title: string;
  host: string;
  sourceUrl: string | null;
  watchUrl: string;
  inCatalog: boolean;
  hidden: boolean;
};

type PlayerErrorsData = PlayerLogData;

function hostLabel(host: string): string {
  return host === "Puterin" ? "Putarin" : host || "—";
}

function wibTime(iso: string | null | undefined): string {
  if (!iso) return "belum pernah";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB`;
}

/**
 * Owner card "Player error": 7-day failure rate per host (from /api/player-log beacons), top 20
 * failing videos, videos the 12-hour dead-video check marked "Dihapus oleh sumber", and the videos
 * hidden from here. "Sembunyikan" is reversible ("Tampilkan lagi"); nothing is deleted.
 */
function PlayerErrorsSection({
  secret,
  data,
  busy,
  reload,
}: {
  secret: string;
  data: PlayerErrorsData | null;
  busy: boolean;
  reload: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState("");
  const load = reload;

  async function toggleHide(id: string, hide: boolean) {
    setBusyId(id);
    try {
      const res = await fetch("/api/player-log", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "owner-hide", id, hide }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!d?.ok) ownerToast(`Gagal: ${d?.error || res.status}`);
      else {
        setNote(hide ? "Video disembunyikan (bisa ditampilkan lagi)." : "Video tampil lagi.");
        await load();
      }
    } catch {
      ownerToast("Koneksi bermasalah.");
    } finally {
      setBusyId("");
    }
  }

  const btn =
    "rounded-md border border-white/[0.12] px-2 py-1 text-[13px] text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50";

  function actions(r: PlayerErrorRow) {
    return (
      <span className="flex shrink-0 flex-wrap items-center gap-1.5">
        {r.sourceUrl ? (
          <a href={r.sourceUrl} target="_blank" rel="noopener" className={btn}>
            Buka sumber
          </a>
        ) : null}
        {r.inCatalog || r.hidden ? (
          <button
            type="button"
            className={btn}
            disabled={busyId === r.id || data?.hideReadable === false}
            onClick={() => void toggleHide(r.id, !r.hidden)}
          >
            {busyId === r.id ? "…" : r.hidden ? "Tampilkan lagi" : "Sembunyikan"}
          </button>
        ) : null}
      </span>
    );
  }

  function title(r: PlayerErrorRow) {
    return r.inCatalog && !r.hidden ? (
      <a href={r.watchUrl} target="_blank" rel="noopener" className="hover:underline">
        {r.title}
      </a>
    ) : (
      <span>{r.title}</span>
    );
  }

  const hosts = data?.hosts || [];
  const top = data?.top || [];
  const gone = data?.gone || [];
  const ownerHidden = data?.ownerHidden || [];

  return (
    <section id="player-error" className="rounded-xl border border-white/[0.08] bg-[#141416] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] uppercase tracking-[0.16em] text-zinc-400">Player error</h2>
        <Button type="button" size="sm" variant="outline" disabled={busy || !secret} onClick={() => void load()}>
          {busy ? "Memuat…" : "Muat ulang"}
        </Button>
      </div>
      {note ? <p className="mt-2 text-[13px] text-zinc-400">{note}</p> : null}
      {data?.storage === "none" ? <p className="mt-2 text-[13px] text-amber-400">Database tidak terbaca.</p> : null}

      {data ? (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px] text-zinc-300">
              <thead className="text-zinc-400">
                <tr>
                  <th className="py-1 pr-3 font-normal">Host</th>
                  <th className="py-1 pr-3 text-right font-normal">Klik play</th>
                  <th className="py-1 pr-3 text-right font-normal">Lambat</th>
                  <th className="py-1 pr-3 text-right font-normal">Gagal</th>
                  <th className="py-1 pr-3 text-right font-normal">Lapor</th>
                  <th className="py-1 pr-3 text-right font-normal">Coba lagi</th>
                  <th className="py-1 pr-3 text-right font-normal">Buka sumber</th>
                  <th className="py-1 text-right font-normal">Server lain</th>
                </tr>
              </thead>
              <tbody>
                {hosts.length ? (
                  hosts.map((h) => (
                    <tr key={h.host} className="border-t border-white/[0.06] tabular-nums">
                      <td className="py-1 pr-3">{hostLabel(h.host)}</td>
                      <td className="py-1 pr-3 text-right">{h.starts}</td>
                      <td className="py-1 pr-3 text-right">{h.slow ?? 0}</td>
                      <td className="py-1 pr-3 text-right">{h.fails}</td>
                      <td className="py-1 pr-3 text-right">{h.reports}</td>
                      <td className="py-1 pr-3 text-right">{h.retries}</td>
                      <td className="py-1 pr-3 text-right">{h.openSource}</td>
                      <td className="py-1 text-right">{h.alt ?? 0}</td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t border-white/[0.06]">
                    <td colSpan={8} className="py-2 text-zinc-400">
                      Belum ada data versi 2. Angka muncul setelah ada pengunjung yang memutar video.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3 className="mt-4 text-[13px] font-medium text-zinc-300">Paling sering gagal ({top.length})</h3>
          {top.length ? (
            <ul className="mt-1 divide-y divide-white/[0.06]">
              {top.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[13px] text-zinc-300">
                  <span className="min-w-0 flex-1">
                    <span className="mr-1.5 text-zinc-400">{hostLabel(r.host)}</span>
                    {title(r)}
                    <span className="ml-1.5 tabular-nums text-zinc-400">
                      {fmt(r.fails)} gagal{r.reports ? `, ${fmt(r.reports)} laporan` : ""}
                      {r.gone ? ", dihapus oleh sumber" : ""}
                      {r.hidden ? ", disembunyikan" : ""}
                    </span>
                  </span>
                  {actions(r)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-zinc-400">Belum ada.</p>
          )}

          <h3 className="mt-4 text-[13px] font-medium text-zinc-300">Dihapus oleh sumber ({gone.length})</h3>
          <p className="text-[13px] text-zinc-400">
            Cek otomatis tiap 12 jam, terakhir {wibTime(data.checkedAt)}. Ditandai setelah 2 kali cek berturut-turut
            {data.suspect ? `; ${data.suspect} lagi menunggu cek kedua` : ""}. Tidak disembunyikan otomatis.
          </p>
          {gone.length ? (
            <ul className="mt-1 max-h-80 divide-y divide-white/[0.06] overflow-y-auto">
              {gone.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[13px] text-zinc-300">
                  <span className="min-w-0 flex-1">
                    <span className="mr-1.5 text-zinc-400">{hostLabel(r.host)}</span>
                    {title(r)}
                    {r.hidden ? <span className="ml-1.5 text-zinc-400">· disembunyikan</span> : null}
                  </span>
                  {actions(r)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-zinc-400">Belum ada.</p>
          )}

          <h3 className="mt-4 text-[13px] font-medium text-zinc-300">Disembunyikan dari sini ({ownerHidden.length})</h3>
          {data.hideReadable === false ? (
            <p className="mt-1 text-[13px] text-amber-400">Penyimpanan tidak terbaca, daftar belum bisa dimuat.</p>
          ) : ownerHidden.length ? (
            <ul className="mt-1 divide-y divide-white/[0.06]">
              {ownerHidden.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[13px] text-zinc-300">
                  <span className="min-w-0 flex-1">
                    <span className="mr-1.5 text-zinc-400">{hostLabel(r.host)}</span>
                    {title(r)}
                  </span>
                  {actions(r)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-zinc-400">Tidak ada.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
