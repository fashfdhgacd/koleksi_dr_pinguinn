"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  loadSecret,
  saveSecret,
  ownerToast,
  OwnerToaster,
  wibHourMinute,
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
      ownerToast("Gagal memuat statistik: jaringan error.", "error", { label: "Coba lagi", run: () => void fetchOnline(key) });
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
      ownerToast("Gagal memuat Kesehatan player: jaringan error.", "error", { label: "Coba lagi", run: () => void loadPlayerLog(key) });
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

  function jumpTo(id: string) {
    if (id !== "top") window.dispatchEvent(new CustomEvent("drp-owner-open", { detail: id }));
    window.setTimeout(() => {
      const el = id === "top" ? document.body : document.getElementById(`collapse-${id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function showGone() {
    window.dispatchEvent(new CustomEvent("drp-owner-open", { detail: "player-error" }));
    window.setTimeout(() => {
      document.getElementById("collapse-player-error")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <div
      className="min-h-dvh text-zinc-100 antialiased"
      style={{ backgroundColor: "#0a0b0c", fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}
    >
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0a0b0c]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-[#2dd4bf]/15 text-sm font-bold text-[#2dd4bf]" aria-hidden="true">
              P
            </span>
            <div className="leading-tight">
              <h1 className="text-base font-semibold text-zinc-50">Panel Pemilik</h1>
              <p className="text-[12px] text-zinc-500">
                {authed ? (lastText ? `Update ${lastText} WIB` : loading ? "Memuat…" : "Belum dimuat") : "Dr. Pinguin"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {authed ? (
              <>
                <Pill ok={botOk} label={botOk == null ? "Bot ..." : botOk ? "Bot aktif" : "Bot perlu dicek"} />
                <Pill ok={pushOk} label={pushOk == null ? "Push ..." : pushOk ? "Push siap" : "Push mati"} />
                <Pill ok label={`Live ${online}`} />
              </>
            ) : null}
            <Link to="/" className={headBtn}>
              Katalog
            </Link>
            {authed ? (
              <>
                <button
                  type="button"
                  className={headBtnPrimary}
                  onClick={() => refreshAll(secret)}
                  disabled={loading}
                >
                  {loading ? "..." : "Refresh"}
                </button>
                <button type="button" className={headBtn} onClick={logout}>
                  Keluar
                </button>
              </>
            ) : null}
          </div>
        </div>
        {authed ? (
          <nav className="mx-auto flex w-full max-w-6xl gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none]" aria-label="Lompat ke bagian">
            {NAV.map(([id, label]) => (
              <button key={id} type="button" className={navChip} onClick={() => jumpTo(id)}>
                {label}
              </button>
            ))}
          </nav>
        ) : null}
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:py-6">
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
            <Collapse id="detector-review" title="Perlu dicek (detector minor)" accent="amber">
              <DetectorReviewSection secret={secret} />
            </Collapse>
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
              beforeFooter={
                <>
                  <Collapse id="player-error" title="Player error (detail + sembunyikan)">
                    <PlayerErrorsSection
                      secret={secret}
                      data={playerLog}
                      busy={playerBusy}
                      reload={() => loadPlayerLog(secret)}
                    />
                  </Collapse>
                  <Collapse id="hidden" title="Video disembunyikan">
                    <HiddenListSection secret={secret} />
                  </Collapse>
                  <Collapse id="videy" title="Videy belum dikasih judul">
                    <OwnerVideyUntitled secret={secret} />
                  </Collapse>
                  <Collapse id="tools" title="Tambah video · Ambil link">
                    <OwnerTools secret={secret} />
                  </Collapse>
                  <Collapse id="poster" title="Poster video">
                    <OwnerTools secret={secret} part="poster" />
                  </Collapse>
                  <Collapse id="bot" title="Bot Telegram">
                    <OwnerTelegramStatus secret={secret} />
                  </Collapse>
                </>
              }
            />
          </>
        )}
      </div>
      <OwnerToaster />
    </div>
  );
}

const NAV: [string, string][] = [
  ["top", "Ringkasan"],
  ["detector-review", "Perlu dicek"],
  ["player-error", "Player error"],
  ["hidden", "Disembunyikan"],
  ["tools", "Tambah video"],
  ["poster", "Poster"],
  ["bot", "Bot"],
];
const navChip =
  "shrink-0 whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[12px] text-zinc-300 transition hover:border-[#2dd4bf]/50 hover:text-[#5eead4]";

const headBtn =
  "whitespace-nowrap rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[13px] text-zinc-300 transition hover:text-zinc-50 disabled:opacity-50";
// Own class list (not headBtn + overrides) so the teal background never loses to bg-[#16161a] in CSS order.
const headBtnPrimary =
  "whitespace-nowrap rounded-lg border border-[#2dd4bf] bg-[#2dd4bf] px-3 py-1.5 text-[13px] font-medium text-zinc-950 transition hover:bg-[#5eead4] disabled:opacity-50";

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
    <div id={`collapse-${id}`} className="scroll-mt-28 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111314]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-medium text-zinc-100 transition hover:bg-white/[0.02]"
      >
        <span className="flex items-center gap-2.5">
          <span className={`size-2 rounded-full ${accent === "amber" ? "bg-amber-400" : "bg-[#2dd4bf]"}`} aria-hidden="true" />
          {title}
        </span>
        <span className={`text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
          ›
        </span>
      </button>
      {open ? <div className="border-t border-white/[0.06] p-2 sm:p-3">{children}</div> : null}
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
      ownerToast("Jaringan error.");
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
    <section id="player-error" className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] uppercase tracking-[0.16em] text-zinc-400">Player error</h2>
        <Button type="button" size="sm" variant="outline" disabled={busy || !secret} onClick={() => void load()}>
          {busy ? "Memuat…" : "Muat ulang"}
        </Button>
      </div>
      {note ? <p className="mt-2 text-[13px] text-zinc-400">{note}</p> : null}
      {data?.storage === "none" ? <p className="mt-2 text-[13px] text-amber-400">Database D1 tidak terbaca.</p> : null}

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
                      {r.fails} gagal{r.reports ? ` · ${r.reports} lapor` : ""}
                      {r.gone ? " · dihapus oleh sumber" : ""}
                      {r.hidden ? " · disembunyikan" : ""}
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
            <p className="mt-1 text-[13px] text-amber-400">KV tidak terbaca, daftar belum bisa dimuat.</p>
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
