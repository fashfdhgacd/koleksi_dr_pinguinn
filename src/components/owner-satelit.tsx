"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ownerToast } from "@/components/owner-dashboard-shared";
import {
  AD_RULES_LABEL,
  SPOT_FIELDS,
  EXOCLICK_SITE,
  type SatelliteHost,
  type SpotKey,
  emptySpots,
} from "@/lib/satelit/config";

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2dd4bf]";
const field = "h-10 w-full rounded-lg border border-white/[0.08] bg-[#0f0f11] px-3 text-sm text-zinc-200";

type VideoRow = { id: string; title: string; at: number; reason: "hidden" | "upload" };
type SitePayload = {
  host: SatelliteHost;
  exoclickSiteId: number;
  lastSync: { syncedAt: string | null; trigger: string | null; added: number | null; upstream: number | null; ok: boolean | null; runUrl: string | null } | null;
  liveCount: number | null;
  sync: boolean;
  folderUrl: string;
  spots: Record<SpotKey, string>;
  syncRequestedAt: string | null;
  lastSyncAt: string | null;
  videos: VideoRow[];
};
type SearchHit = { id: string; title: string; source: string };

function fmt(iso: string | null): string {
  if (!iso) return "Belum tercatat";
  try {
    return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }) + " WIB";
  } catch {
    return iso;
  }
}

function Collapse({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#101214]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-zinc-100 hover:bg-white/[0.03] ${focusRing}`}
      >
        <span>{title}</span>
        <span className="shrink-0 text-[13px] font-medium text-[#5eead4]">{open ? "Ciutkan" : "Buka"}</span>
      </button>
      {open ? <div className="border-t border-white/[0.06] p-4">{children}</div> : null}
    </div>
  );
}

/** Situs satelit: sync, iklan, folder videqsss, sembunyikan per video. Muat sekali, tanpa polling. */
export function OwnerSatelit({ secret, host }: { secret: string; host: SatelliteHost }) {
  const [syncOn, setSyncOn] = useState(true);
  const [folderUrl, setFolderUrl] = useState("");
  const [spots, setSpots] = useState<Record<SpotKey, string>>(emptySpots());
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SitePayload["lastSync"]>(null);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchNote, setSearchNote] = useState("");

  const applySite = useCallback((site: SitePayload | undefined) => {
    if (!site || site.host !== host) return;
    setSyncOn(site.sync);
    setFolderUrl(site.folderUrl || "");
    setSpots({ ...emptySpots(), ...site.spots });
    setRequestedAt(site.syncRequestedAt);
    setLastSyncAt(site.lastSyncAt);
    setLastSync(site.lastSync ?? null);
    setLiveCount(typeof site.liveCount === "number" ? site.liveCount : null);
    setVideos(Array.isArray(site.videos) ? site.videos : []);
  }, [host]);

  const load = useCallback(async () => {
    const res = await fetch("/api/owner-satelit", { headers: { "x-online-key": secret }, cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; sites?: SitePayload[]; error?: string } | null;
    if (!res.ok || !data?.ok) {
      ownerToast(data?.error || "Gagal memuat situs satelit.", "error");
      return;
    }
    applySite(data.sites?.find((site) => site.host === host));
  }, [secret, host, applySite]);

  useEffect(() => {
    if (!secret) return;
    void load();
  }, [secret, load]);

  async function post(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/owner-satelit", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ host, ...body }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; sites?: SitePayload[]; error?: string; detail?: string } | null;
      if (!res.ok || !data?.ok) {
        ownerToast(data?.error || "Gagal menyimpan.", "error");
        return;
      }
      applySite(data.sites?.find((site) => site.host === host));
      ownerToast(data.detail || okText, "ok");
    } catch {
      ownerToast("Koneksi bermasalah.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    const q = query.trim();
    if (q.length < 2) {
      setSearchNote("Ketik minimal 2 huruf.");
      setHits([]);
      return;
    }
    setSearchNote("Mencari…");
    try {
      const res = await fetch("/api/owner-tools", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "catalog-search", q, limit: 20 }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; items?: SearchHit[]; total?: number } | null;
      if (!res.ok || !data?.ok) {
        setSearchNote("Gagal mencari.");
        return;
      }
      setHits(data.items || []);
      setSearchNote(`${data.total || 0} video.`);
    } catch {
      setSearchNote("Koneksi bermasalah.");
    }
  }

  const skipped = new Set(videos.map((row) => row.id));

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-white/[0.07] bg-[#101214] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-50">Situs satelit · {host}</h2>
            <p className="mt-1 text-[12px] text-zinc-500">
              ExoClick · {EXOCLICK_SITE[host].name} (site {EXOCLICK_SITE[host].siteId}), aktif · popunder zone {EXOCLICK_SITE[host].popunderZone}. Daftar blokir katalog tetap berlaku di semua situs.
            </p>
          </div>
          <a href={`https://${host}`} target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#5eead4] hover:underline">
            Buka situs
          </a>
        </div>
        <label className="mt-4 flex min-h-11 items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" checked={syncOn} onChange={(e) => setSyncOn(e.target.checked)} className="size-4 accent-[#2dd4bf]" />
          Sinkron harian aktif
        </label>
        <dl className="mt-3 grid gap-2 text-[13px] text-zinc-400 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Sync terakhir</dt>
            <dd className="text-zinc-200">{fmt(lastSyncAt)}</dd>
            {lastSync ? (
              <dd className="text-[12px] text-zinc-500">
                {lastSync.ok === false ? "Gagal ambil katalog · " : ""}
                {lastSync.added != null ? `+${lastSync.added.toLocaleString("id-ID")} video baru` : ""}
                {lastSync.trigger ? ` · ${lastSync.trigger === "daily" ? "harian" : lastSync.trigger === "panel-request" ? "dari panel" : "manual"}` : ""}
                {lastSync.runUrl ? (
                  <>
                    {" · "}
                    <a href={lastSync.runUrl} target="_blank" rel="noopener noreferrer" className="text-[#5eead4] hover:underline">
                      log
                    </a>
                  </>
                ) : null}
              </dd>
            ) : null}
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Video tayang</dt>
            <dd className="text-zinc-200">{liveCount != null ? liveCount.toLocaleString("id-ID") : "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Permintaan sync</dt>
            <dd className="text-zinc-200">{fmt(requestedAt)}</dd>
            {requestedAt && (!lastSyncAt || Date.parse(requestedAt) > Date.parse(lastSyncAt)) ? (
              <dd className="text-[12px] text-amber-300/80">Menunggu workflow satelit (biasanya beberapa menit, paling lama ±2 jam).</dd>
            ) : null}
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void post({ action: "save", sync: syncOn, folderUrl, spots }, "Tersimpan.")} className={`rounded-lg bg-[#2dd4bf] px-3 py-2 text-[13px] font-medium text-zinc-950 disabled:opacity-50 ${focusRing}`}>
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void post({ action: "sync", sync: syncOn, folderUrl, spots }, "Permintaan sync tercatat.")}
            className={`rounded-lg border border-white/15 px-3 py-2 text-[13px] text-zinc-100 disabled:opacity-50 ${focusRing}`}
          >
            Sync sekarang
          </button>
        </div>
      </section>

      {host === "videqsss.icu" ? (
        <Collapse title="Tautan folder (impor pertama)">
          <p className="text-[12px] text-zinc-500">
            Sync pertama mengimpor seluruh isi folder ini. Sync berikutnya mengikuti katalog dan daftar sembunyi. Jangan tempel tautan yang berisi kunci.
          </p>
          <input
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            placeholder="https://…"
            inputMode="url"
            className={`${field} mt-3`}
            aria-label="Tautan folder videqsss.icu"
          />
          <p className="mt-2 text-[12px] text-zinc-500">Simpan lewat tombol Simpan di atas.</p>
        </Collapse>
      ) : null}

      <Collapse title="Iklan ExoClick">
        <p className="text-[12px] text-zinc-400">{AD_RULES_LABEL}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SPOT_FIELDS.map((fieldDef) => (
            <label key={fieldDef.key} className="block text-[12px] text-zinc-400">
              {fieldDef.label}
              <input
                value={spots[fieldDef.key]}
                onChange={(e) => setSpots((cur) => ({ ...cur, [fieldDef.key]: e.target.value.trim() }))}
                inputMode="numeric"
                placeholder="Zone ID ExoClick"
                className={`${field} mt-1`}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-zinc-500">Simpan lewat tombol Simpan di atas. Zone ID hanya angka; popunder kosong = zone terverifikasi di atas.</p>
      </Collapse>

      <Collapse title="Video di situs ini">
        <p className="text-[12px] text-zinc-500">
          Sembunyikan hanya berlaku di {host}. Video yang sama tetap tayang di situs lain. Blokir katalog (owner:catalog-block:v1) tetap membuang video di semua situs.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder="Cari judul atau ID"
            className={`${field} min-w-[12rem] flex-1`}
            aria-label="Cari video"
          />
          <button type="button" onClick={() => void search()} className={`min-h-11 rounded-lg border border-white/15 px-3 text-[13px] text-zinc-100 ${focusRing}`}>
            Cari
          </button>
        </div>
        {searchNote ? <p className="mt-2 text-[12px] text-zinc-500">{searchNote}</p> : null}
        <ul className="mt-3 flex flex-col gap-2">
          {hits.map((hit) => {
            const off = skipped.has(hit.id);
            return (
              <li key={hit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-100">{hit.title || hit.id}</p>
                  <p className="text-[11px] text-zinc-500">
                    {hit.id} · {hit.source} · {off ? "tidak tayang di situs ini" : "tayang di situs ini"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void post({ action: "video", id: hit.id, show: off, title: hit.title }, off ? "Ditayangkan di situs ini." : "Disembunyikan di situs ini.")}
                  className={`rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-zinc-100 disabled:opacity-50 ${focusRing}`}
                >
                  {off ? "Tayangkan" : "Sembunyikan"}
                </button>
              </li>
            );
          })}
        </ul>
        {videos.length ? (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Tidak tayang di {host} ({videos.length})</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {videos.slice(0, 40).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-zinc-300">
                  <span className="min-w-0 truncate">
                    {row.title || row.id}{" "}
                    <span className="text-zinc-500">{row.reason === "hidden" ? "· disembunyikan" : "· tidak dipilih saat upload"}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void post({ action: "video", id: row.id, show: true, title: row.title }, "Ditayangkan di situs ini.")}
                    className={`shrink-0 text-[12px] text-[#5eead4] disabled:opacity-50 ${focusRing}`}
                  >
                    Tayangkan
                  </button>
                </li>
              ))}
            </ul>
            {videos.length > 40 ? <p className="mt-2 text-[12px] text-zinc-500">dan {videos.length - 40} lainnya. Cari ID-nya untuk menayangkan.</p> : null}
          </div>
        ) : (
          <p className="mt-4 text-[12px] text-zinc-500">Belum ada video yang disembunyikan di situs ini.</p>
        )}
      </Collapse>
    </div>
  );
}
