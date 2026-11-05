// /pemilik "Pelanggan notifikasi": jumlah langganan web push (D1 push_subs). Sekali muat, tanpa polling.
import { useEffect, useState } from "react";

type Data = {
  ok: boolean;
  error?: string;
  total: number;
  last24h: number;
  last7d: number;
  lastSend: { at: number; subs: number } | null;
};

const card = "min-w-0 rounded-2xl border border-white/[0.06] bg-[#101214] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5";
const h2 = "text-[15px] font-semibold tracking-tight text-zinc-50";

function wib(ms: number): string {
  const d = new Date(ms + 7 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)} WIB`;
}

export function OwnerPushCard({ secret }: { secret: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!secret) return;
    fetch("/api/owner-push", { headers: { "x-online-key": secret } })
      .then((r) => r.json() as Promise<Data>)
      .then((d) => (d.ok ? setData(d) : setErr(d.error || "Gagal memuat.")))
      .catch(() => setErr("Gagal memuat."));
  }, [secret]);

  return (
    <section className={card}>
      <h2 className={h2}>Pelanggan notifikasi</h2>
      {data ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              ["Total", data.total],
              ["24 jam", data.last24h],
              ["7 hari", data.last7d],
            ].map(([label, n]) => (
              <div key={label as string}>
                <p className="text-2xl font-semibold tabular-nums text-zinc-100">{Number(n).toLocaleString("id-ID")}</p>
                <p className="text-[13px] text-zinc-500">{label === "Total" ? "Total" : `Baru ${label}`}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-zinc-500">
            {data.lastSend
              ? `Kiriman terakhir ${wib(data.lastSend.at)} ke ${data.lastSend.subs.toLocaleString("id-ID")} pelanggan.`
              : "Belum pernah kirim notifikasi."}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-zinc-400">{err || "Memuat…"}</p>
      )}
    </section>
  );
}
