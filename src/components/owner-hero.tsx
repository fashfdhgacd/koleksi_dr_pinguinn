// /pemilik "Hero beranda": owner picks up to 5 hero videos (search, add, reorder, remove, clear,
// save). One KV write per save via /api/owner-hero; nothing is polled. Shows the live video and
// the next switch (24 h / 5 slots, WIB). Without picks the hero uses the top 5 rolling 24 h.
import { useCallback, useEffect, useState } from "react";

type Slim = { id: string; title: string; thumbnail: string | null; category: string | null };
type Status = {
  ok: boolean;
  error?: string;
  picks: string[];
  source: "manual" | "top24h" | "none";
  list: Slim[];
  slot: number;
  current: Slim | null;
  nextSwitchAt: number;
  note?: string;
};

const card = "min-w-0 rounded-xl border border-white/[0.08] border-t-[#2dd4bf]/40 bg-[#131316] p-4 sm:p-5";
const h2 = "flex items-center justify-between gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#2dd4bf]";
const btn =
  "shrink-0 whitespace-nowrap rounded-md border border-white/[0.12] bg-[#16161a] px-2 py-1 text-[13px] text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50";

function wibTime(ms: number): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(11, 16) + " WIB";
}

export function OwnerHeroCard({ secret }: { secret: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [picks, setPicks] = useState<Slim[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Slim[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = useCallback((s: Status) => {
    setStatus(s);
    if (s.ok) setPicks(s.source === "manual" ? s.list.filter((v) => s.picks.includes(v.id)) : []);
  }, []);

  useEffect(() => {
    if (!secret) return;
    fetch("/api/owner-hero", { headers: { "x-online-key": secret } })
      .then((r) => r.json() as Promise<Status>)
      .then(apply)
      .catch(() => setMsg("Gagal memuat."));
  }, [secret, apply]);

  async function search() {
    const term = q.trim();
    if (!term) return;
    setMsg("");
    try {
      const r = await fetch(`/api/data?type=search&q=${encodeURIComponent(term)}&limit=10`);
      const d = (await r.json()) as { items?: Slim[] };
      setResults((d.items || []).map((v) => ({ id: v.id, title: v.title, thumbnail: v.thumbnail, category: v.category })));
      if (!d.items?.length) setMsg("Tidak ketemu.");
    } catch {
      setMsg("Pencarian gagal.");
    }
  }

  function add(v: Slim) {
    setPicks((p) => (p.some((x) => x.id === v.id) || p.length >= 5 ? p : [...p, v]));
  }
  function move(i: number, d: number) {
    setPicks((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }

  async function save(ids: string[]) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/owner-hero", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ ids }),
      });
      const d = (await r.json()) as Status;
      if (!d.ok) setMsg(d.error || "Gagal menyimpan.");
      else {
        apply(d);
        setMsg(ids.length ? "Tersimpan." : "Pilihan dihapus, kembali ke top 24 jam.");
      }
    } catch {
      setMsg("Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={card}>
      <div className={h2}>
        <span>Hero beranda</span>
        <span className="text-[11px] font-normal normal-case tracking-normal text-zinc-400">
          {status?.source === "manual" ? "Pilihan manual" : status?.source === "top24h" ? "Otomatis: top 24 jam" : ""}
        </span>
      </div>
      {status?.current ? (
        <p className="mt-2 text-[13px] text-zinc-300">
          Tayang sekarang (slot {status.slot + 1}/5): <b className="text-zinc-100">{status.current.title}</b>
          <br />
          Ganti berikutnya: {wibTime(status.nextSwitchAt)}
        </p>
      ) : null}
      {status?.list?.length ? (
        <ol className="mt-2 list-decimal pl-5 text-[13px] text-zinc-400">
          {status.list.map((v) => (
            <li key={v.id} className="truncate">{v.title}</li>
          ))}
        </ol>
      ) : null}

      <div className="mt-4 text-[12px] uppercase tracking-wider text-zinc-500">Pilihan manual (maks 5)</div>
      {picks.length ? (
        <ul className="mt-1">
          {picks.map((v, i) => (
            <li key={v.id} className="flex items-center gap-2 border-t border-white/[0.05] py-1.5">
              <span className="w-4 text-[13px] text-[#2dd4bf]/60">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{v.title}</span>
              <button type="button" className={btn} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className={btn} disabled={i === picks.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className={btn} onClick={() => setPicks((p) => p.filter((x) => x.id !== v.id))}>Hapus</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-zinc-500">Belum ada (hero memakai top 24 jam).</p>
      )}
      <div className="mt-2 flex gap-2">
        <button type="button" className={btn} disabled={busy} onClick={() => void save(picks.map((v) => v.id))}>Simpan</button>
        <button type="button" className={btn} disabled={busy} onClick={() => { setPicks([]); void save([]); }}>Kosongkan</button>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
          placeholder="Cari video…"
          className="min-w-0 flex-1 rounded-md border border-white/[0.12] bg-[#0f0f12] px-2 py-1 text-sm text-zinc-100"
        />
        <button type="button" className={btn} onClick={() => void search()}>Cari</button>
      </div>
      {results.length ? (
        <ul className="mt-2">
          {results.map((v) => (
            <li key={v.id} className="flex items-center gap-2 border-t border-white/[0.05] py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{v.title}</span>
              <button type="button" className={btn} disabled={picks.length >= 5 || picks.some((x) => x.id === v.id)} onClick={() => add(v)}>
                Tambah
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {msg ? <p className="mt-2 text-[13px] text-zinc-400">{msg}</p> : null}
      {status?.note ? <p className="mt-2 text-[11px] text-zinc-500">{status.note}</p> : null}
    </section>
  );
}
