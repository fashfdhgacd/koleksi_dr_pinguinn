"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  url: string;
  title: string;
  site: string;
  at: number;
  thumb: string;
};

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2dd4bf]";

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

/** /pemilik: antrean link Videy dari penonton. Tertutup sampai dibuka. Belum tayang sebelum disetujui. */
export function OwnerKirimanVidey({ secret, boxed = false }: { secret: string; boxed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kiriman-videy", { headers: { "x-online-key": secret }, cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; items?: Row[] } | null;
      if (res.ok && data?.ok) {
        setRows(data.items || []);
        setError(null);
      } else {
        setError("Gagal memuat kiriman.");
      }
    } catch {
      setError("Gagal memuat kiriman.");
    }
  }, [secret]);

  useEffect(() => {
    if (!secret) return;
    void load();
  }, [secret, load]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail === "kiriman-videy") setOpen(true);
    };
    window.addEventListener("drp-owner-open", onOpen);
    return () => window.removeEventListener("drp-owner-open", onOpen);
  }, []);

  const act = async (action: "approve" | "reject" | "reject-all", id?: string) => {
    setBusy(id || action);
    setNote(null);
    try {
      const res = await fetch("/api/kiriman-videy", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action, ...(id ? { id } : {}) }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; text?: string; error?: string } | null;
      if (res.ok && data?.ok) {
        setNote(action === "approve" ? "Masuk katalog." : action === "reject-all" ? "Semua ditolak." : "Ditolak.");
        await load();
      } else {
        setError(data?.text || "Gagal menyimpan.");
      }
    } catch {
      setError("Gagal menyimpan.");
    } finally {
      setBusy(null);
    }
  };

  const count = rows?.length || 0;
  const body = (
    <div id="collapse-kiriman-videy" className="scroll-mt-24">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-zinc-100 transition hover:bg-white/[0.03] ${focusRing}`}
      >
        <span className="flex items-center gap-2.5">
          <span className="size-2 rounded-full bg-[#2dd4bf]" aria-hidden="true" />
          Kiriman penonton (Videy)
          {count > 0 ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold leading-5 text-zinc-950 tabular-nums">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[13px] font-medium text-[#5eead4]">{open ? "Ciutkan" : "Buka"}</span>
      </button>
      {open ? (
        <div className="border-t border-white/[0.06] bg-black/20 p-2 sm:p-3">
          <div className="flex flex-col gap-2 text-[13px]">
            <p className="text-[12px] text-zinc-500">Belum tayang. Setujui memasukkan video ke katalog untuk videyy.icu.</p>
            {error ? <p className="text-red-400">{error}</p> : null}
            {note ? <p className="text-zinc-400">{note}</p> : null}
            {rows === null ? (
              <p className="text-zinc-500">Memuat…</p>
            ) : rows.length === 0 ? (
              <p className="text-zinc-500">Belum ada kiriman.</p>
            ) : (
              <>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      if (window.confirm("Tolak semua kiriman yang menunggu?")) void act("reject-all");
                    }}
                    className="rounded-md bg-red-800/70 px-2.5 py-1 text-[12px] font-semibold hover:bg-red-700 disabled:opacity-50"
                  >
                    Tolak semua
                  </button>
                </div>
                {rows.map((row) => (
                  <div key={row.id} className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 sm:flex-row sm:items-center">
                    <a href={row.url} target="_blank" rel="noopener noreferrer" className="shrink-0" aria-label={`Pratinjau ${row.id}`}>
                      <img
                        src={row.thumb}
                        alt=""
                        width={112}
                        height={64}
                        className="h-16 w-28 rounded-md bg-zinc-800 object-cover"
                        onError={(e) => {
                          e.currentTarget.style.visibility = "hidden";
                        }}
                      />
                    </a>
                    <div className="min-w-0 flex-1">
                      <a href={row.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-300 hover:underline">
                        {row.title || "(tanpa judul)"}
                      </a>
                      <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                        {row.id} · {row.site} · {wib(row.at)} WIB
                      </p>
                      <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-zinc-400 hover:text-zinc-200">
                        Pratinjau
                      </a>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void act("approve", row.id)}
                        className="rounded-md bg-emerald-700/80 px-2.5 py-1 text-[12px] font-semibold hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {busy === row.id ? "Memproses…" : "Setujui"}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void act("reject", row.id)}
                        className="rounded-md bg-red-800/70 px-2.5 py-1 text-[12px] font-semibold hover:bg-red-700 disabled:opacity-50"
                      >
                        Tolak
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (!boxed) return body;
  return <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#101214]">{body}</div>;
}
