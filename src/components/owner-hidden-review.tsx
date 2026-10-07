"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  title: string;
  terms: string[];
  tocilOnly: boolean;
  source: string;
  category: string;
  status: string;
  watchUrl: string;
  sourceUrl: string | null;
  sourcePageUrl: string | null;
  checkedAt: number | null;
  firstSeen: number;
  publish: "off" | "on" | null;
};

function startOfTodayWib(): number {
  const wib = Date.now() + 7 * 3600_000;
  return wib - (wib % 86_400_000) - 7 * 3600_000;
}

function statusGroup(s: string): string {
  return s.replace(/^Tampil di (?!Lainnya)\S+?(,| \()/, "Tampil di kategori lain$1");
}

const PAGE = 100;

export function HiddenReviewSection({ secret }: { secret: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);

  const call = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await fetch("/api/owner-tools", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify(body),
      });
      return r.json();
    },
    [secret],
  );

  useEffect(() => {
    if (!secret) return;
    let alive = true;
    call({ action: "hidden-review" })
      .then((d) => {
        if (!alive) return;
        if (d?.ok) setRows(d.items || []);
        else setErr(d?.error || "gagal");
      })
      .catch(() => alive && setErr("gagal"));
    return () => {
      alive = false;
    };
  }, [secret, call]);

  async function mark(row: Row, patch: { checked?: boolean; publish?: "off" | "on" | null }) {
    setBusy(row.id);
    try {
      const d = await call({ action: "review-mark", id: row.id, ...patch });
      if (!d?.ok) {
        setErr(d?.error || "gagal");
        return;
      }
      setRows((prev) =>
        (prev || []).map((r) => {
          if (r.id !== row.id) return r;
          const next = { ...r };
          if (patch.checked !== undefined) next.checkedAt = patch.checked ? Date.now() : null;
          if (patch.publish !== undefined) {
            next.publish = patch.publish;
            if (patch.publish === "off") next.status = "Tidak publish (dihapus dari situs publik)";
          }
          return next;
        }),
      );
    } finally {
      setBusy(null);
    }
  }

  const opts = useMemo(() => {
    const t = new Set<string>();
    const s = new Set<string>();
    const st = new Set<string>();
    for (const r of rows || []) {
      r.terms.forEach((x) => t.add(x));
      s.add(r.source);
      st.add(statusGroup(r.status));
    }
    return { terms: [...t].sort(), sources: [...s].sort(), statuses: [...st].sort() };
  }, [rows]);

  const today = startOfTodayWib();
  const summary = useMemo(() => {
    const all = rows || [];
    return {
      total: all.length,
      unchecked: all.filter((r) => !r.checkedAt).length,
      today: all.filter((r) => r.firstSeen >= today).length,
    };
  }, [rows, today]);

  const shown = useMemo(() => {
    const key = q.trim().toLowerCase();
    return (rows || []).filter(
      (r) =>
        (!term || r.terms.includes(term)) &&
        (!source || r.source === source) &&
        (!status || statusGroup(r.status) === status) &&
        (!onlyUnchecked || !r.checkedAt) &&
        (!key || r.title.toLowerCase().includes(key) || r.id.toLowerCase().includes(key)),
    );
  }, [rows, q, term, source, status, onlyUnchecked]);

  const sel = "rounded-md border border-white/[0.08] bg-[#0f0f11] px-2 py-1 text-xs text-zinc-200";

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
      <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Video disembunyikan (perlu review)</h2>
      <p className="mt-2 text-xs text-amber-300/80">
        Cek videonya. Kalau pemeran jelas dewasa, ganti judul di situs sumber; kalau ragu, hapus dari sumber.
      </p>
      <p className="mt-1 text-[11px] text-zinc-500">
        "Tidak publish" menghapus video dari situs publik (listing, cari, sitemap, halaman tonton 404).
      </p>
      {err ? <p className="mt-3 text-xs text-red-400">Error: {err}</p> : null}
      {!rows && !err ? <p className="mt-3 text-xs text-zinc-500">Memuat…</p> : null}
      {rows ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ["Total", summary.total],
              ["Belum dicek", summary.unchecked],
              ["Baru hari ini (WIB)", summary.today],
            ].map(([label, n]) => (
              <div key={String(label)} className="rounded-xl border border-white/[0.06] bg-[#0f0f11] p-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
                <p className="mt-1 text-2xl text-zinc-50">{n}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input className={sel} placeholder="Cari judul / id" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className={sel} value={term} onChange={(e) => setTerm(e.target.value)}>
              <option value="">Semua istilah</option>
              {opts.terms.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select className={sel} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Semua sumber</option>
              {opts.sources.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Semua status</option>
              {opts.statuses.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-zinc-400">
              <input type="checkbox" checked={onlyUnchecked} onChange={(e) => setOnlyUnchecked(e.target.checked)} />
              Belum dicek saja
            </label>
            <span className="text-xs text-zinc-500">{shown.length} hasil</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Dicek</th>
                  <th className="pb-2 pr-3 font-medium">Judul asli</th>
                  <th className="pb-2 pr-3 font-medium">Istilah</th>
                  <th className="pb-2 pr-3 font-medium">Sumber</th>
                  <th className="pb-2 pr-3 font-medium">Kategori</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium">Publish</th>
                  <th className="pb-2 font-medium">Link</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {shown.slice(0, limit).map((r) => (
                  <tr key={r.id} className="border-t border-white/[0.05] align-top">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        disabled={busy === r.id}
                        checked={Boolean(r.checkedAt)}
                        onChange={(e) => mark(r, { checked: e.target.checked })}
                        aria-label="Sudah dicek"
                      />
                    </td>
                    <td className="py-2 pr-3">{r.title}</td>
                    <td className="py-2 pr-3 text-amber-300">{r.terms.join(", ") || "—"}</td>
                    <td className="py-2 pr-3">{r.source}</td>
                    <td className="py-2 pr-3">{r.category}</td>
                    <td className="py-2 pr-3">{r.status}</td>
                    <td className="py-2 pr-3">
                      <select
                        className={sel}
                        disabled={busy === r.id}
                        value={r.publish || ""}
                        onChange={(e) => mark(r, { publish: (e.target.value || null) as Row["publish"] })}
                      >
                        <option value="">Default</option>
                        <option value="off">Tidak publish</option>
                      </select>
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <a className="text-sky-400 hover:underline" href={r.watchUrl} target="_blank" rel="noreferrer">
                        Tonton
                      </a>
                      {r.sourcePageUrl || r.sourceUrl ? (
                        <>
                          {" · "}
                          <a
                            className="text-sky-400 hover:underline"
                            href={(r.sourcePageUrl || r.sourceUrl)!}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.sourcePageUrl ? "Halaman sumber" : "Sumber"}
                          </a>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length > limit ? (
            <button className="mt-3 text-xs text-sky-400 hover:underline" onClick={() => setLimit(limit + PAGE)}>
              Tampilkan {Math.min(PAGE, shown.length - limit)} lagi
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
