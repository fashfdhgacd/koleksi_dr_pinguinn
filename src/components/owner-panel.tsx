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
import { OwnerTools } from "@/components/owner-tools";
import { OwnerAuthedBottom } from "@/components/owner-authed-bottom";
import { HiddenListSection } from "@/components/owner-hidden-list";
import { OwnerTelegramStatus } from "@/components/owner-telegram-status";
import { Button } from "@/components/ui/button";

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
          info?: { lastErrorMessage?: string } | null;
        } | null;
        if (alive) setBotOk(Boolean(d?.ok && d.urlOk && d.info && !d.info.lastErrorMessage));
      } catch {
        if (alive) setBotOk(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authed, secret]);

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
    <div className="min-h-dvh text-zinc-100" style={{ backgroundColor: "#0c0c0e" }}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Dr. Pinguin</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-50">
              Pemilik
              <span className="size-2 bg-[#2dd4bf]" aria-hidden="true" />
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {authed ? (
              <>
                <Pill ok={botOk} label={botOk == null ? "Bot ..." : botOk ? "Bot aktif" : "Bot perlu dicek"} />
                <Pill ok label={`Live ${online}`} />
              </>
            ) : null}
            <Link to="/" className={headBtn}>
              Katalog
            </Link>
            {authed ? (
              <>
                <button type="button" className={headBtn} onClick={() => void fetchOnline(secret)} disabled={loading}>
                  {loading ? "..." : "Refresh"}
                </button>
                <button type="button" className={headBtn} onClick={logout}>
                  Keluar
                </button>
              </>
            ) : null}
          </div>
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
            <OwnerAuthedTop
              online={online}
              stats={stats}
              tickAt={tickAt}
              error={error}
              vsUniq={vsUniq}
              vsViews={vsViews}
              secret={secret}
              days={days}
              devices={devices}
            />
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
                  <Collapse title="Player error">
                    <PlayerErrorsSection secret={secret} />
                  </Collapse>
                  <Collapse title="Video disembunyikan">
                    <HiddenListSection secret={secret} />
                  </Collapse>
                  <Collapse title="Poster video">
                    <OwnerTools secret={secret} part="poster" />
                  </Collapse>
                  <Collapse title="Bot Telegram">
                    <OwnerTelegramStatus secret={secret} />
                  </Collapse>
                </>
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

const headBtn =
  "whitespace-nowrap rounded-md border border-white/[0.1] bg-[#16161a] px-2.5 py-1 text-xs text-zinc-300 transition hover:text-zinc-50 disabled:opacity-50";

function Pill({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-white/[0.08] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400">
      <span className={`size-1.5 ${ok == null ? "bg-zinc-600" : ok ? "bg-[#2dd4bf]" : "bg-amber-400"}`} />
      {label}
    </span>
  );
}

/** Collapsed-by-default block for less used owner sections. Content mounts only when opened. */
function Collapse({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/[0.07] border-t-[#2dd4bf]/35 bg-[#121215]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2dd4bf]"
      >
        {title}
        <span className="text-zinc-600">{open ? "-" : "+"}</span>
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

type PlayerErrorsData = {
  ok?: boolean;
  error?: string;
  storage?: string;
  version?: number;
  since?: string;
  hosts?: {
    host: string;
    starts: number;
    slow?: number;
    fails: number;
    reports: number;
    retries: number;
    openSource: number;
    alt?: number;
    rate: number | null;
  }[];
  top?: (PlayerErrorRow & { fails: number; starts: number; reports: number; gone: boolean })[];
  gone?: (PlayerErrorRow & { since: string })[];
  suspect?: number;
  checkedAt?: string | null;
  ownerHidden?: (PlayerErrorRow & { at: number | null })[];
  hideReadable?: boolean;
};

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
function PlayerErrorsSection({ secret }: { secret: string }) {
  const [data, setData] = useState<PlayerErrorsData | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    if (!secret) return;
    setBusy(true);
    try {
      const res = await fetch("/api/player-log", { headers: { "x-online-key": secret }, cache: "no-store" });
      const d = (await res.json().catch(() => null)) as PlayerErrorsData | null;
      if (!d) setNote("Gagal membaca jawaban server.");
      else if (d.error === "forbidden") setNote("Kunci salah.");
      else {
        setData(d);
        setNote("");
      }
    } catch {
      setNote("Jaringan error.");
    } finally {
      setBusy(false);
    }
  }, [secret]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleHide(id: string, hide: boolean) {
    setBusyId(id);
    try {
      const res = await fetch("/api/player-log", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "owner-hide", id, hide }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!d?.ok) setNote(`Gagal: ${d?.error || res.status}`);
      else {
        setNote(hide ? "Video disembunyikan (bisa ditampilkan lagi)." : "Video tampil lagi.");
        await load();
      }
    } catch {
      setNote("Jaringan error.");
    } finally {
      setBusyId("");
    }
  }

  const btn =
    "rounded-md border border-white/[0.12] px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50";

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
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Player error</h2>
        <Button type="button" size="sm" variant="outline" disabled={busy || !secret} onClick={() => void load()}>
          {busy ? "Memuat…" : "Muat ulang"}
        </Button>
      </div>
      {note ? <p className="mt-2 text-xs text-zinc-400">{note}</p> : null}
      {data?.storage === "none" ? <p className="mt-2 text-xs text-amber-400">Database D1 tidak terbaca.</p> : null}

      {data ? (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs text-zinc-300">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 pr-3 font-normal">Host</th>
                  <th className="py-1 pr-3 text-right font-normal">Putar</th>
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
                    <td colSpan={8} className="py-2 text-zinc-500">
                      Belum ada data versi 2. Angka muncul setelah ada pengunjung yang memutar video.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3 className="mt-4 text-xs font-medium text-zinc-300">Paling sering gagal ({top.length})</h3>
          {top.length ? (
            <ul className="mt-1 divide-y divide-white/[0.06]">
              {top.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs text-zinc-300">
                  <span className="min-w-0 flex-1">
                    <span className="mr-1.5 text-zinc-500">{hostLabel(r.host)}</span>
                    {title(r)}
                    <span className="ml-1.5 tabular-nums text-zinc-500">
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
            <p className="mt-1 text-xs text-zinc-500">Belum ada.</p>
          )}

          <h3 className="mt-4 text-xs font-medium text-zinc-300">Dihapus oleh sumber ({gone.length})</h3>
          <p className="text-[11px] text-zinc-500">
            Cek otomatis tiap 12 jam, terakhir {wibTime(data.checkedAt)}. Ditandai setelah 2 kali cek berturut-turut
            {data.suspect ? `; ${data.suspect} lagi menunggu cek kedua` : ""}. Tidak disembunyikan otomatis.
          </p>
          {gone.length ? (
            <ul className="mt-1 max-h-80 divide-y divide-white/[0.06] overflow-y-auto">
              {gone.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs text-zinc-300">
                  <span className="min-w-0 flex-1">
                    <span className="mr-1.5 text-zinc-500">{hostLabel(r.host)}</span>
                    {title(r)}
                    {r.hidden ? <span className="ml-1.5 text-zinc-500">· disembunyikan</span> : null}
                  </span>
                  {actions(r)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-zinc-500">Belum ada.</p>
          )}

          <h3 className="mt-4 text-xs font-medium text-zinc-300">Disembunyikan dari sini ({ownerHidden.length})</h3>
          {data.hideReadable === false ? (
            <p className="mt-1 text-xs text-amber-400">KV tidak terbaca, daftar belum bisa dimuat.</p>
          ) : ownerHidden.length ? (
            <ul className="mt-1 divide-y divide-white/[0.06]">
              {ownerHidden.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs text-zinc-300">
                  <span className="min-w-0 flex-1">
                    <span className="mr-1.5 text-zinc-500">{hostLabel(r.host)}</span>
                    {title(r)}
                  </span>
                  {actions(r)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-zinc-500">Tidak ada.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
