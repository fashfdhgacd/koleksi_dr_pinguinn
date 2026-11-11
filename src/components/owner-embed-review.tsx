"use client";

import { useCallback, useEffect, useState } from "react";

/** Rows from detector-review-list tagged kind:"embed" (first-seen embed domains). */
type Row = {
  id: string;
  title: string;
  thumbUrl: string;
  watchUrl: string;
  group: "pending" | "approved" | "held";
  trigger: string;
  source?: string;
  decidedAt: number | null;
  live: boolean | null;
  kind?: "embed";
};

async function post<T>(secret: string, body: Record<string, unknown>): Promise<T & { ok?: boolean; error?: string }> {
  try {
    const res = await fetch("/api/owner-tools", {
      method: "POST",
      headers: { "content-type": "application/json", "x-online-key": secret },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return ((await res.json().catch(() => null)) || { ok: false, error: `HTTP ${res.status}` }) as never;
  } catch {
    return { ok: false, error: "Koneksi bermasalah." } as never;
  }
}

const btn =
  "rounded-lg px-3 py-1.5 text-[13px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2dd4bf] disabled:opacity-50";

/**
 * "Domain embed baru": generic embed links (host "embed") from domains the owner
 * hasn't approved yet. Setuju = publish + whitelist the whole domain permanently
 * (later links bypass review); Tidak setuju = stays hidden, domain not whitelisted.
 */
export function EmbedReviewSection({
  secret,
  onCount,
}: {
  secret: string;
  onCount?: (n: number) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const d = await post<{ items?: Row[] }>(secret, { action: "detector-review-list" });
    if (d.ok && d.items) {
      setRows(d.items.filter((r) => r.kind === "embed"));
      setErr("");
    } else setErr(d.error || "Gagal memuat.");
  }, [secret]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = (rows || []).filter((r) => r.group === "pending");
  const decided = (rows || []).filter((r) => r.group !== "pending");
  useEffect(() => {
    onCount?.(pending.length);
  }, [rows, pending.length, onCount]);

  const approveAll = async () => {
    const ids = pending.map((r) => r.id);
    if (!ids.length) return;
    setBusy("__all__");
    setErr("");
    const d = await post<{ approved?: string[] }>(secret, { action: "detector-review-approve-all", ids });
    setBusy("");
    if (!d.ok) {
      setErr(d.error || "Gagal.");
      return;
    }
    const n = d.approved?.length ?? ids.length;
    void load();
    void n;
  };

  const decide = async (r: Row, decision: "show" | "keep") => {
    setBusy(r.id);
    setErr("");
    const d = await post(secret, { action: "detector-review-decide", id: r.id, decision });
    setBusy("");
    if (!d.ok) {
      setErr(d.error === "locked_minor" ? "Terkunci minor — tidak bisa disetujui." : d.error || "Gagal.");
      return;
    }
    setRows((rs) =>
      (rs || []).map((x) =>
        x.id === r.id
          ? { ...x, group: decision === "show" ? "approved" : "held", decidedAt: Date.now(), live: decision === "show" }
          : x,
      ),
    );
    void load();
  };

  if (rows === null)
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat">
        {[0, 1].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed text-zinc-500">
        Link embed dari domain baru ditahan dulu. <strong className="text-zinc-300">Setuju</strong> = video
        tayang <em>dan</em> domain itu di-bypass permanen — link berikutnya dari domain sama langsung
        tayang tanpa review. <strong className="text-zinc-300">Tidak setuju</strong> = video tetap
        tersembunyi, domain tidak di-whitelist.
      </p>
      {err ? (
        <p role="alert" className="text-[13px] text-red-300">
          {err}
        </p>
      ) : null}
      {pending.length ? (
        <button
          type="button"
          disabled={busy === "__all__"}
          onClick={() => void approveAll()}
          className="self-start rounded-lg bg-[#2dd4bf] px-4 py-2 text-[13px] font-medium text-zinc-950 transition hover:opacity-90 disabled:opacity-50"
        >
          {busy === "__all__" ? "Menyetujui…" : `Setujui semua (${pending.length}) — tayang + bypass semua domain`}
        </button>
      ) : null}
      {pending.map((r) => (
        <div
          key={r.id}
          className="flex flex-col gap-3 rounded-lg border border-[#2dd4bf]/20 bg-[#0c0e0f] p-3 sm:flex-row"
        >
          <a href={r.watchUrl} target="_blank" rel="noreferrer noopener" className="shrink-0" aria-label="Pratinjau">
            <img
              src={r.thumbUrl}
              alt=""
              loading="lazy"
              className="aspect-video w-full rounded-lg bg-black object-cover sm:h-20 sm:w-32"
            />
          </a>
          <div className="min-w-0 flex-1 text-sm">
            <p className="break-words font-medium leading-snug text-zinc-100">{r.title}</p>
            <p className="mt-1 text-[13px] text-[#5eead4]">Domain: {r.trigger || "?"}</p>
            <p className="text-[12px] text-zinc-500">{r.source}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void decide(r, "show")}
                className={`${btn} bg-[#2dd4bf] font-medium text-zinc-950`}
              >
                Setuju — tayang + bypass domain
              </button>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void decide(r, "keep")}
                className={`${btn} border border-white/[0.1] bg-white/[0.04] text-zinc-200`}
              >
                Tidak setuju
              </button>
            </div>
          </div>
        </div>
      ))}
      {!pending.length ? (
        <p className="rounded-lg border border-dashed border-white/[0.08] px-4 py-4 text-center text-[13px] text-zinc-500">
          Tidak ada domain embed yang menunggu.
        </p>
      ) : null}
      {decided.length ? (
        <details className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
          <summary className="cursor-pointer text-[13px] font-medium text-zinc-300">
            Sudah diputuskan ({decided.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {decided.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-[13px]">
                <img src={r.thumbUrl} alt="" loading="lazy" className="h-9 w-16 shrink-0 rounded bg-black object-cover" />
                <a
                  href={r.watchUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 flex-1 truncate text-zinc-200 hover:underline"
                >
                  {r.title}
                </a>
                <span className="shrink-0 text-[12px] text-zinc-500">{r.trigger}</span>
                <span className={r.group === "approved" ? "shrink-0 text-[12px] text-emerald-400" : "shrink-0 text-[12px] text-zinc-500"}>
                  {r.group === "approved" ? "disetujui" : "ditolak"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
