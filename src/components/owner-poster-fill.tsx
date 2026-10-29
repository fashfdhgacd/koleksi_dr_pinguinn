"use client";

import { useRef, useState } from "react";

type PlatformStat = { checked: number; had: number; filled: number; missing: number; titleFilled?: number; titleMissing?: number };
type Row = {
  id: string;
  title: string;
  platform: string;
  status: "filled" | "missing";
  reason?: string;
  titleStatus?: "filled" | "missing";
  newTitle?: string;
};
type MetaEntry = { title?: string; none?: string; at?: string };
type Batch = {
  ok: boolean;
  error?: string;
  total: number;
  nextOffset: number;
  done: boolean;
  byPlatform: Record<string, PlatformStat>;
  rows: Row[];
  newPosters: Record<string, string>;
  newMeta?: Record<string, MetaEntry>;
};

const RESUME_KEY = "kdp_poster_fill_offset";

const REASONS: Record<string, string> = {
  "videy-frame-belum-ada": "Videy: frame diambil workflow videy-thumbs, bukan dari situs Videy",
  "tidak-ada-sumber": "Platform gak ngasih gambar",
  "putarin-tanpa-gambar": "Puterin gak punya gambar buat video ini",
  "placeholder-url": "Cuma gambar placeholder",
  "placeholder-md5": "Cuma gambar placeholder",
  "too-small": "Gambar rusak / terlalu kecil",
  "not-image": "Bukan gambar",
  "fetch-failed": "Gagal diunduh",
  "sumber-nggak-ngasih": "Sumber nggak ngasih",
};

function addStats(a: Record<string, PlatformStat>, b: Record<string, PlatformStat>): Record<string, PlatformStat> {
  const out: Record<string, PlatformStat> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k] || { checked: 0, had: 0, filled: 0, missing: 0, titleFilled: 0, titleMissing: 0 };
    out[k] = {
      checked: cur.checked + v.checked,
      had: cur.had + v.had,
      filled: cur.filled + v.filled,
      missing: cur.missing + v.missing,
      titleFilled: (cur.titleFilled || 0) + (v.titleFilled || 0),
      titleMissing: (cur.titleMissing || 0) + (v.titleMissing || 0),
    };
  }
  return out;
}

/**
 * /pemilik "Isi poster": walks the whole public catalog in small batches (one request at a time,
 * only while the owner's run is on), fills missing posters into R2 and lists what is still missing
 * per platform. Generic titles ("Koleksi Dr. Pinguin Bokep N", file names) are looked up on the same
 * platform too (not Videy); found titles are saved with one commit per 50 ("set-auto-meta").
 * No timers or polling: the next batch starts when the previous answer arrives.
 */
export function OwnerPosterFill({ secret }: { secret: string }) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, PlatformStat>>({});
  const [missing, setMissing] = useState<Row[]>([]);
  const [newPosters, setNewPosters] = useState<Record<string, string>>({});
  const [newMeta, setNewMeta] = useState<Record<string, MetaEntry>>({});
  const [foundTitles, setFoundTitles] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const stopRef = useRef(false);

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/owner-tools", {
      method: "POST",
      headers: { "content-type": "application/json", "x-online-key": secret },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => null)) as (Batch & { text?: string }) | null;
    return { res, d };
  }

  async function run(fromStart: boolean) {
    if (running) return;
    let at = 0;
    if (!fromStart) {
      try {
        at = Math.max(0, Number(localStorage.getItem(RESUME_KEY)) || 0);
      } catch {
        at = 0;
      }
    }
    if (fromStart || at === 0) {
      setStats({});
      setMissing([]);
      setNewPosters({});
      setNewMeta({});
      setFoundTitles([]);
    }
    setError(null);
    setSavedMsg(null);
    setRunning(true);
    stopRef.current = false;
    try {
      while (!stopRef.current) {
        const { res, d } = await post({ action: "poster-fill", offset: at, limit: 40 });
        if (!res.ok || !d?.ok) {
          setError(d?.error === "r2_unavailable" ? "Penyimpanan poster (R2) gak kebaca." : `Gagal: ${d?.error || res.status}`);
          break;
        }
        setTotal(d.total);
        setStats((s) => addStats(s, d.byPlatform || {}));
        const miss = (d.rows || []).filter((r) => r.status === "missing");
        if (miss.length) setMissing((m) => [...m, ...miss].slice(-500));
        if (d.newPosters && Object.keys(d.newPosters).length) setNewPosters((p) => ({ ...p, ...d.newPosters }));
        if (d.newMeta && Object.keys(d.newMeta).length) setNewMeta((m) => ({ ...m, ...d.newMeta }));
        const titled = (d.rows || []).filter((r) => r.titleStatus === "filled" && r.newTitle);
        if (titled.length) setFoundTitles((t) => [...t, ...titled].slice(-500));
        at = d.done ? 0 : d.nextOffset;
        setOffset(d.done ? d.total : d.nextOffset);
        try {
          localStorage.setItem(RESUME_KEY, String(at));
        } catch {
          /* resume is optional */
        }
        if (d.done) break;
      }
    } catch {
      setError("Koneksi putus. Klik Lanjutkan buat nerusin dari posisi terakhir.");
    } finally {
      setRunning(false);
    }
  }

  async function saveLinks() {
    const entries = Object.entries(newPosters);
    if (!entries.length || saving) return;
    setSaving(true);
    setSavedMsg(null);
    let saved = 0;
    try {
      // 50 per call (server limit); each call is one commit of data/latest-posters.json.
      for (let i = 0; i < entries.length; i += 50) {
        const { res, d } = await post({ action: "set-posters", posters: Object.fromEntries(entries.slice(i, i + 50)) });
        if (!res.ok || !d?.ok) {
          setSavedMsg(`Berhenti di ${saved}: ${d?.error || res.status}`);
          return;
        }
        saved += Math.min(50, entries.length - i);
      }
      setSavedMsg(`${saved} link poster disimpan. Tampil setelah deploy berikutnya (±2-3 menit).`);
      setNewPosters({});
    } catch {
      setSavedMsg("Koneksi putus waktu nyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTitles() {
    const entries = Object.entries(newMeta);
    if (!entries.length || saving) return;
    setSaving(true);
    setSavedMsg(null);
    let added = 0;
    let marked = 0;
    let hidden = 0;
    try {
      // 50 per call (server limit); each call is one commit of data/auto-meta.json.
      for (let i = 0; i < entries.length; i += 50) {
        const { res, d } = await post({ action: "set-auto-meta", meta: Object.fromEntries(entries.slice(i, i + 50)) });
        const r = d as (Batch & { added?: number; marked?: number; hidden?: number }) | null;
        if (!res.ok || !r?.ok) {
          setSavedMsg(`Berhenti setelah ${added} judul: ${r?.error || res.status}`);
          return;
        }
        added += r.added || 0;
        marked += r.marked || 0;
        hidden += r.hidden || 0;
      }
      setSavedMsg(
        `${added} judul asli disimpan, ${marked} ditandai "sumber nggak ngasih"${hidden ? `, ${hidden} tetap disembunyiin (judulnya kena filter)` : ""}. Tampil setelah deploy berikutnya (±2-3 menit).`,
      );
      setNewMeta({});
    } catch {
      setSavedMsg("Koneksi putus waktu nyimpan.");
    } finally {
      setSaving(false);
    }
  }

  const platforms = Object.entries(stats).sort((a, b) => b[1].checked - a[1].checked);
  const sum = platforms.reduce(
    (acc, [, v]) => ({ had: acc.had + v.had, filled: acc.filled + v.filled, missing: acc.missing + v.missing }),
    { had: 0, filled: 0, missing: 0 },
  );
  const pct = total ? Math.min(100, Math.round((offset / total) * 100)) : 0;
  const linkCount = Object.keys(newPosters).length;
  const titleCount = Object.values(newMeta).filter((m) => m.title).length;
  const noSourceCount = Object.values(newMeta).filter((m) => m.none).length;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-200">
      <button type="button" className="flex w-full items-center justify-between text-left font-semibold" onClick={() => setExpanded((v) => !v)}>
        <span>Isi poster + judul (semua platform)</span>
        <span className="text-xs text-zinc-500">{expanded ? "Tutup" : "Buka"}</span>
      </button>
      {expanded ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-zinc-400">
            Cek semua video publik satu per satu (per 40), isi poster yang kosong atau rusak dari platform aslinya, simpan ke R2. Judul generik (mis. "Koleksi Dr. Pinguin Bokep 12")
            juga dicari judul aslinya, kecuali Videy.
            Video yang disembunyiin gak diproses.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={running} onClick={() => void run(true)} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white disabled:opacity-50">
              Mulai dari awal
            </button>
            <button type="button" disabled={running} onClick={() => void run(false)} className="rounded-lg bg-zinc-800 px-3 py-1.5 disabled:opacity-50">
              Lanjutkan
            </button>
            <button type="button" disabled={!running} onClick={() => (stopRef.current = true)} className="rounded-lg bg-zinc-800 px-3 py-1.5 disabled:opacity-50">
              Berhenti
            </button>
          </div>
          {total ? (
            <div>
              <div className="h-2 w-full overflow-hidden rounded bg-zinc-800">
                <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                {offset.toLocaleString("id-ID")} / {total.toLocaleString("id-ID")} video dicek{running ? " …" : ""} · sudah ada {sum.had} · diisi{" "}
                {sum.filled} · masih kosong {sum.missing}
              </p>
            </div>
          ) : null}
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
          {platforms.length ? (
            <table className="w-full text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="text-left font-normal">Platform</th>
                  <th className="text-right font-normal">Dicek</th>
                  <th className="text-right font-normal">Sudah ada</th>
                  <th className="text-right font-normal">Diisi</th>
                  <th className="text-right font-normal">Kosong</th>
                  <th className="text-right font-normal">Judul diisi</th>
                  <th className="text-right font-normal">Judul kosong</th>
                </tr>
              </thead>
              <tbody>
                {platforms.map(([name, v]) => (
                  <tr key={name} className="border-t border-zinc-900">
                    <td>{name}</td>
                    <td className="text-right">{v.checked}</td>
                    <td className="text-right">{v.had}</td>
                    <td className="text-right text-emerald-400">{v.filled}</td>
                    <td className={v.missing ? "text-right text-amber-400" : "text-right"}>{v.missing}</td>
                    <td className="text-right text-emerald-400">{v.titleFilled || 0}</td>
                    <td className={v.titleMissing ? "text-right text-amber-400" : "text-right"}>{v.titleMissing || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {linkCount ? (
            <div className="rounded-lg border border-zinc-800 p-2 text-xs">
              <p>
                {linkCount} video tadinya gak punya link poster sama sekali. Gambarnya udah di R2, tapi biar kartunya pake, link-nya perlu disimpan
                (1 commit per 50).
              </p>
              <button type="button" disabled={saving || running} onClick={() => void saveLinks()} className="mt-2 rounded-lg bg-emerald-700 px-3 py-1 text-white disabled:opacity-50">
                {saving ? "Menyimpan…" : `Simpan ${linkCount} link poster`}
              </button>
            </div>
          ) : null}
          {titleCount || noSourceCount ? (
            <div className="rounded-lg border border-zinc-800 p-2 text-xs">
              <p>
                {titleCount} video dapet judul asli dari platformnya{noSourceCount ? `, ${noSourceCount} sumber nggak ngasih judul` : ""}. Judul
                yang udah bener nggak pernah ditimpa. Videy dilewati (nggak ada judul di sana).
              </p>
              <button type="button" disabled={saving || running} onClick={() => void saveTitles()} className="mt-2 rounded-lg bg-emerald-700 px-3 py-1 text-white disabled:opacity-50">
                {saving ? "Menyimpan…" : `Simpan ${titleCount} judul`}
              </button>
            </div>
          ) : null}
          {savedMsg ? <p className="text-xs text-zinc-300">{savedMsg}</p> : null}
          {foundTitles.length ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-emerald-400">Judul ketemu ({foundTitles.length})</summary>
              <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
                {foundTitles.map((r) => (
                  <li key={`t-${r.platform}-${r.id}`} className="border-b border-zinc-900 pb-1">
                    <span className="text-zinc-500">{r.platform}</span> {r.title} → <span className="text-zinc-200">{r.newTitle}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {missing.length ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-amber-400">Masih kosong ({missing.length})</summary>
              <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
                {missing.map((r) => (
                  <li key={`${r.platform}-${r.id}`} className="flex justify-between gap-2 border-b border-zinc-900 pb-1">
                    <span className="truncate">
                      <span className="text-zinc-500">{r.platform}</span> {r.title}
                    </span>
                    <span className="shrink-0 text-zinc-500">{REASONS[r.reason || ""] || r.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
