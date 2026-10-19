"use client";

import { useCallback, useEffect, useState } from "react";

type Row = { id: string; title: string; thumb: string; createdAt: number };
type AdCounts = Record<string, { today: number; week: number }>;

const AD_LABELS: [string, string][] = [
  ["ad_play", "Tampil"],
  ["ad_muted", "Tanpa suara"],
  ["ad_skip", "Dilewati"],
  ["ad_complete", "Selesai"],
  ["vast_empty", "Kosong"],
  ["vast_timeout", "Timeout"],
  ["vast_error", "Gagal muat"],
  ["ad_error", "Error"],
];

function wib(ms: number): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

/** /pemilik: Videy videos that still carry the bot's automatic title, with a field to name them. */
export function OwnerVideyUntitled({ secret }: { secret: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ads, setAds] = useState<AdCounts | null>(null);
  // Collapsed by default, same header as the panel's other Collapse sections (owner-panel.tsx).
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!secret) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/ad-log", { headers: { "x-online-key": secret }, cache: "no-store" });
        const d = (await res.json().catch(() => null)) as { ok?: boolean; events?: AdCounts } | null;
        if (alive && res.ok && d?.ok && d.events) setAds(d.events);
      } catch {
        /* counts are optional */
      }
    })();
    return () => {
      alive = false;
    };
  }, [secret]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/owner-videy", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "list" }),
        cache: "no-store",
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; items?: Row[] } | null;
      if (!res.ok || !d?.ok) {
        setLoadError("Gagal ambil daftar.");
        return;
      }
      setLoadError(null);
      setRows(d.items || []);
    } catch {
      setLoadError("Jaringan error.");
    }
  }, [secret]);

  useEffect(() => {
    if (secret) void load();
  }, [secret, load]);

  async function save(id: string) {
    const title = (drafts[id] || "").replace(/\s+/g, " ").trim();
    if (title.length < 4) {
      setErrors((e) => ({ ...e, [id]: "Judul minimal 4 karakter." }));
      return;
    }
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch("/api/owner-videy", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "save", id, title }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; title?: string; error?: string } | null;
      if (!res.ok || !d?.ok) {
        setErrors((e) => ({ ...e, [id]: d?.error || "Gagal menyimpan." }));
        return;
      }
      setDone((s) => ({ ...s, [id]: d.title || title }));
    } catch {
      setErrors((e) => ({ ...e, [id]: "Jaringan error." }));
    } finally {
      setBusy(null);
    }
  }

  const open = (rows || []).filter((r) => !done[r.id]);
  const showList = !(rows && !open.length && !Object.keys(done).length && !loadError);

  return (
    <>
      {ads ? (
        <section id="videy-iklan" className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-zinc-300">Iklan Videy</h2>
            <span className="text-xs text-zinc-500">hari ini / 7 hari</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {AD_LABELS.map(([k, label]) => (
              <div key={k} className="rounded-lg border border-white/[0.06] bg-[#0f0f12] px-3 py-2">
                <div className="text-xs text-zinc-500">{label}</div>
                <div className="mt-0.5 text-sm text-zinc-100">
                  <span className={k === "ad_play" ? "text-[#2dd4bf]" : ""}>{ads[k]?.today ?? 0}</span>
                  <span className="text-zinc-500"> / {ads[k]?.week ?? 0}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {showList ? (
    <section id="videy-judul" className="rounded-xl border border-white/[0.07] border-t-[#2dd4bf]/35 bg-[#121215]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2dd4bf]"
      >
        <span>
          Videy belum dikasih judul
          {rows ? <span className="ml-2 font-normal normal-case tracking-normal text-zinc-500">{open.length} video</span> : null}
        </span>
        <span className="text-zinc-600">{expanded ? "-" : "+"}</span>
      </button>
      {expanded ? (
      <div className="border-t border-white/[0.06] p-2 sm:p-3">
      {loadError ? <p className="mt-1 text-sm text-amber-400">{loadError}</p> : null}
      {rows == null && !loadError ? <p className="mt-3 text-sm text-zinc-500">...</p> : null}
      <div className="mt-3">
        {(rows || []).map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[88px_1fr] gap-2.5 border-t border-white/[0.06] py-3.5 first:border-t-0 sm:grid-cols-[120px_1fr] sm:gap-3.5"
          >
            <a href={`/watch/${r.id}`} target="_blank" rel="noreferrer">
              <img
                src={r.thumb}
                alt=""
                loading="lazy"
                className="h-[50px] w-[88px] rounded-lg bg-[#1f1f23] object-cover sm:h-[68px] sm:w-[120px]"
              />
            </a>
            <div className="min-w-0">
              <div className="mb-2 text-[13px] text-zinc-400">
                <span className="font-medium text-zinc-200">{done[r.id] || r.title}</span>
                {r.createdAt ? ` · ${wib(r.createdAt)}` : ""}
              </div>
              {done[r.id] ? (
                <p className="text-xs text-[#2dd4bf]">Tersimpan</p>
              ) : (
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(r.id);
                  }}
                >
                  <input
                    value={drafts[r.id] || ""}
                    onChange={(e) => setDrafts((s) => ({ ...s, [r.id]: e.target.value }))}
                    maxLength={200}
                    aria-label="Judul"
                    className="min-w-0 flex-1 rounded-lg border border-[#2a2a2f] bg-[#0c0c0e] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#2dd4bf]"
                  />
                  <button
                    type="submit"
                    disabled={busy === r.id}
                    className="h-[38px] rounded-lg bg-[#2dd4bf] px-4 text-sm font-semibold text-[#062621] disabled:opacity-60"
                  >
                    {busy === r.id ? "..." : "Simpan"}
                  </button>
                </form>
              )}
              {errors[r.id] ? <p className="mt-1.5 text-xs text-amber-400">{errors[r.id]}</p> : null}
            </div>
          </div>
        ))}
      </div>
      </div>
      ) : null}
    </section>
      ) : null}
    </>
  );
}
