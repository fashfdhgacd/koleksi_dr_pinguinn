"use client";

import { useCallback, useEffect, useState } from "react";

/** Same shape as DetectorReviewRow (src/lib/owner-detector-review.ts). */
type Row = {
  id: string;
  title: string;
  translation: string | null;
  thumbUrl: string;
  watchUrl: string;
  group: "pending" | "approved" | "held";
  trigger: string;
  strict: boolean;
  locked: string;
  triage?: "explicit" | "verification" | "";
  evidence?: string[];
  decidedAt: number | null;
  live: boolean | null;
};

async function post<T>(
  secret: string,
  body: Record<string, unknown>,
): Promise<T & { ok?: boolean; error?: string }> {
  try {
    const res = await fetch("/api/owner-tools", {
      method: "POST",
      headers: { "content-type": "application/json", "x-online-key": secret },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return ((await res.json().catch(() => null)) || {
      ok: false,
      error: `HTTP ${res.status}`,
    }) as never;
  } catch {
    return { ok: false, error: "Koneksi bermasalah." } as never;
  }
}

const btn =
  "rounded-lg px-3 py-1.5 text-[13px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2dd4bf] disabled:opacity-50";

function when(at: number | null): string {
  if (!at) return "";
  return (
    new Date(at).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }) + " WIB"
  );
}

function errText(e?: string): string {
  if (e === "locked_minor")
    return "Video ini terkunci (di bawah umur), tidak bisa ditayangkan. Judul tetap bisa diganti.";
  if (e === "proof_required")
    return "Tulis catatan singkat dulu (mis. udah ditonton, pemain dewasa).";
  if (e === "title_needs_rename")
    return "Judul masih kena cek. Ganti judulnya dulu, lalu Simpan judul.";
  if (e === "review_pending_needs_proof")
    return "Video ini sensitif: tulis catatan singkat dulu, lalu Tayangkan.";
  return e || "Gagal.";
}

/**
 * "Perlu dicek" (owner request 2026-11-02: one simple list). Only videos still waiting for the owner;
 * Tayangkan moves a video to "Sudah disetujui" for good (automatic checks never hold it again),
 * Tetap tahan moves it to "Ditahan". Both decided lists are collapsed.
 */
export function DetectorReviewSection({
  secret,
  onCount,
}: {
  secret: string;
  onCount?: (n: number) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [proofs, setProofs] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const d = await post<{ items?: Row[] }>(secret, { action: "detector-review-list" });
    if (d.ok && d.items) {
      setRows(d.items);
      setErr("");
    } else setErr(d.error || "Gagal memuat.");
  }, [secret]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (r: Row, decision: "show" | "keep") => {
    setBusy(r.id);
    setErr("");
    const proof = (proofs[r.id] || "").trim();
    const d = await post(secret, {
      action: "detector-review-decide",
      id: r.id,
      decision,
      ...(proof ? { proof } : {}),
    });
    setBusy("");
    if (!d.ok) {
      setNotes((n) => ({ ...n, [r.id]: errText(d.error) }));
      return;
    }
    // Move it at once; the server list (reloaded below) is the source of truth.
    setRows((rs) =>
      (rs || []).map((x) =>
        x.id === r.id
          ? {
              ...x,
              group: decision === "show" ? "approved" : "held",
              decidedAt: Date.now(),
              live: decision === "show",
            }
          : x,
      ),
    );
    void load();
  };

  // Inline title edit: always saved. A title that passes the check goes live, and is recorded as approved.
  const saveTitle = async (r: Row) => {
    const title = (drafts[r.id] ?? r.title).replace(/\s+/g, " ").trim();
    if (!title || title === r.title) return;
    setBusy(r.id);
    const d = await post<{ live?: boolean | null; note?: string }>(secret, {
      action: "edit-video",
      id: r.id,
      title,
    });
    setBusy("");
    if (!d.ok) {
      setNotes((n) => ({ ...n, [r.id]: `Gagal menyimpan: ${d.error || "?"}` }));
      return;
    }
    setDrafts((x) => {
      const next = { ...x };
      delete next[r.id];
      return next;
    });
    if (d.live) {
      await decide({ ...r, title }, "show");
      return;
    }
    setNotes((n) => ({
      ...n,
      [r.id]: r.strict
        ? "Judul tersimpan. Tulis catatan singkat lalu Tayangkan."
        : d.note || "Judul tersimpan, tapi masih kena cek. Ganti kata yang ditandai.",
    }));
    await load();
  };

  // "Tayangkan semua": one tap for every non-sensitive waiting video (strict ones need a proof note).
  const approveAll = async (ids: string[]) => {
    if (
      !ids.length ||
      !window.confirm(
        `Tayangkan ${ids.length} video sekaligus? Video sensitif (perlu catatan) tidak ikut.`,
      )
    )
      return;
    setBusy("all");
    setErr("");
    const d = await post<{ approved?: string[]; skipped?: string[] }>(secret, {
      action: "detector-review-approve-all",
      ids,
    });
    setBusy("");
    if (!d.ok) {
      setErr(errText(d.error));
      return;
    }
    const done = new Set(d.approved || []);
    setRows((rs) =>
      (rs || []).map((x) =>
        done.has(x.id) ? { ...x, group: "approved", decidedAt: Date.now(), live: true } : x,
      ),
    );
    if (d.skipped?.length)
      setErr(`${d.skipped.length} video tidak ikut (perlu catatan atau terkunci).`);
    void load();
  };

  // One card for "Perlu dicek" and "Ditahan": thumbnail preview, inline title edit, Tayangkan
  // (sensitive: short owner note; hard minor lock: reason shown, no Tayangkan).
  const card = (r: Row, held: boolean) => (
    <div
      key={r.id}
      className="flex flex-col gap-3 rounded-lg border border-amber-400/15 bg-[#0c0e0f] p-3 sm:flex-row"
    >
      <a
        href={r.watchUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="shrink-0"
        aria-label="Pratinjau"
      >
        <img
          src={r.thumbUrl}
          alt=""
          loading="lazy"
          className="aspect-video w-full rounded-lg bg-black object-cover sm:h-20 sm:w-32"
        />
      </a>
      <div className="min-w-0 flex-1 text-sm">
        <p className="break-words font-medium leading-snug text-zinc-100">{r.title}</p>
        {r.translation ? <p className="text-[12px] text-zinc-500">🇮🇩 {r.translation}</p> : null}
        {r.trigger ? <p className="mt-1 text-[13px] text-amber-300">Kena: {r.trigger}</p> : null}
        {r.locked ? (
          <p className="mt-1 text-[12px] text-red-300">
            Terkunci, tidak bisa ditayangkan: {r.locked}. Judul tetap bisa diganti.
            {r.triage === "verification"
              ? " Status: perlu verifikasi (hanya kata kunci, tetap ditahan)."
              : r.triage === "explicit"
                ? " Status: ada bukti usia muda."
                : ""}
            {r.evidence?.length ? ` Bukti: ${r.evidence.join("; ")}.` : ""}
          </p>
        ) : r.strict ? (
          <p className="text-[12px] text-red-300">
            Sensitif: tulis catatan singkat dulu, lalu Tayangkan.
          </p>
        ) : null}
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void saveTitle(r);
          }}
        >
          <input
            type="text"
            aria-label="Judul"
            value={drafts[r.id] ?? r.title}
            maxLength={200}
            onChange={(e) => setDrafts((x) => ({ ...x, [r.id]: e.target.value }))}
            className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-black/40 px-2.5 py-1.5 text-[13px] text-zinc-100"
          />
          <button
            type="submit"
            disabled={
              busy === r.id ||
              !(drafts[r.id] ?? "").trim() ||
              (drafts[r.id] ?? "").trim() === r.title
            }
            className={`${btn} border border-[#2dd4bf]/40 text-[#5eead4]`}
          >
            Simpan judul
          </button>
        </form>
        {r.strict && !r.locked ? (
          <input
            type="text"
            aria-label="Catatan pemilik"
            value={proofs[r.id] || ""}
            maxLength={500}
            onChange={(e) => setProofs((p) => ({ ...p, [r.id]: e.target.value }))}
            placeholder="Catatan: udah ditonton, pemain dewasa"
            className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-black/40 px-2.5 py-1.5 text-[13px] text-zinc-100"
          />
        ) : null}
        {notes[r.id] ? <p className="mt-1 text-[12px] text-amber-200">{notes[r.id]}</p> : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.locked ? null : (
            <button
              type="button"
              disabled={busy === r.id || (r.strict && !(proofs[r.id] || "").trim())}
              onClick={() => decide(r, "show")}
              className={`${btn} bg-[#2dd4bf] font-medium text-zinc-950`}
            >
              Tayangkan
            </button>
          )}
          {held ? null : (
            <button
              type="button"
              disabled={busy === r.id}
              onClick={() => decide(r, "keep")}
              className={`${btn} border border-white/[0.1] bg-white/[0.04] text-zinc-200`}
            >
              Tetap tahan
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const pending = (rows || []).filter((r) => r.group === "pending");
  const approved = (rows || []).filter((r) => r.group === "approved");
  const held = (rows || []).filter((r) => r.group === "held");
  useEffect(() => {
    if (rows) onCount?.(pending.length);
  }, [rows, pending.length, onCount]);

  if (err && !rows)
    return (
      <div role="alert" className="flex flex-col items-start gap-2 py-2">
        <p className="text-sm text-red-300">Gagal memuat daftar: {err}</p>
        <button
          type="button"
          onClick={() => void load()}
          className={`${btn} border border-white/[0.1] text-zinc-200`}
        >
          Coba lagi
        </button>
      </div>
    );
  if (!rows)
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">Perlu dicek ({pending.length})</h2>
        {pending.some((r) => !r.strict) ? (
          <button
            type="button"
            disabled={busy !== ""}
            onClick={() => void approveAll(pending.filter((r) => !r.strict).map((r) => r.id))}
            className={`${btn} bg-[#2dd4bf] font-medium text-zinc-950`}
          >
            Tayangkan semua ({pending.filter((r) => !r.strict).length})
          </button>
        ) : null}
      </div>
      {err ? (
        <p role="alert" className="text-[13px] text-red-300">
          {err}
        </p>
      ) : null}
      {pending.map((r) => card(r, false))}
      {!pending.length ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-white/[0.08] px-4 py-6 text-center">
          <span className="text-lg text-[#2dd4bf]" aria-hidden="true">
            ✓
          </span>
          <p className="text-sm font-medium text-zinc-200">Semua beres, tidak ada yang menunggu.</p>
        </div>
      ) : null}

      <details className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
        <summary className="cursor-pointer text-sm font-medium text-emerald-300">
          Sudah disetujui ({approved.length})
        </summary>
        <p className="mt-1 text-[12px] text-zinc-500">
          Tetap tayang. Cek otomatis tidak akan menahannya lagi.
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {approved.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-[13px]">
              <img
                src={r.thumbUrl}
                alt=""
                loading="lazy"
                className="h-9 w-16 shrink-0 rounded bg-black object-cover"
              />
              <a
                href={r.watchUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="min-w-0 flex-1 truncate text-zinc-200 hover:underline"
              >
                {r.title}
              </a>
              <span
                className={`shrink-0 text-[12px] ${r.live === false ? "text-amber-300" : "text-emerald-300"}`}
              >
                {r.live === false ? "belum tayang" : "✓ tayang"}
              </span>
              <span className="shrink-0 text-[12px] text-zinc-500">{when(r.decidedAt)}</span>
            </li>
          ))}
        </ul>
      </details>

      <details className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
        <summary className="cursor-pointer text-sm font-medium text-zinc-300">
          Ditahan ({held.length})
        </summary>
        <p className="mt-1 text-[12px] text-zinc-500">
          Ganti judul atau pencet Tayangkan kapan saja.
        </p>
        <div className="mt-2 flex flex-col gap-2">{held.map((r) => card(r, true))}</div>
      </details>
    </div>
  );
}
