"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type WebhookInfo = {
  url: string;
  isOurs: boolean;
  pendingUpdateCount: number;
  lastErrorDate: string | null;
  lastErrorMessage: string | null;
};

type WebhookResponse = {
  ok?: boolean;
  error?: string;
  installed?: boolean;
  expectedUrl?: string;
  urlOk?: boolean;
  info?: WebhookInfo | null;
  lastSetupAt?: string | null;
  lastVerifiedUpdateAt?: string | null;
};

function wib(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB`;
}

type RecentRow = { id: string; title: string; host: string; at: string; status: "live" | "hidden" | "pending"; reason: string };
type RecentResponse = { ok?: boolean; error?: string; rows?: RecentRow[]; putarinTotal?: number; videosTotal?: number };
type CronStatus = { flush?: string; last?: string };

/**
 * "Baru masuk": newest Telegram uploads (Putarin + Videy) from the deployed bot files with their
 * catalog status, plus the Videy upload queue state from /api/cron-status. Read-only.
 */
function RecentUploads({ secret }: { secret: string }) {
  const [data, setData] = useState<RecentResponse | null>(null);
  const [flush, setFlush] = useState<{ at?: string; entries?: number; committed?: number } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!secret) return;
    setBusy(true);
    try {
      const [r, c] = await Promise.all([
        fetch("/api/owner-recent", { headers: { "x-online-key": secret }, cache: "no-store" }),
        fetch("/api/cron-status", { cache: "no-store" }).catch(() => null),
      ]);
      const d = (await r.json().catch(() => null)) as RecentResponse | null;
      if (!d) setNote("Gagal membaca jawaban server.");
      else if (d.error === "forbidden") setNote("Kunci salah.");
      else if (!d.ok) setNote(`Gagal: ${d.error || r.status}`);
      else {
        setData(d);
        setNote("");
      }
      const cs = c ? ((await c.json().catch(() => null)) as CronStatus | null) : null;
      try {
        setFlush(cs?.flush ? JSON.parse(cs.flush) : null);
      } catch {
        setFlush(null);
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

  const rows = data?.rows || [];
  const label = (s: RecentRow["status"]) => (s === "live" ? "Tayang" : s === "hidden" ? "Disembunyikan" : "Belum tayang");
  const color = (s: RecentRow["status"]) => (s === "live" ? "text-[#2dd4bf]" : s === "hidden" ? "text-amber-400" : "text-zinc-500");

  return (
    <div className="mt-5 border-t border-white/[0.06] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Baru masuk</h3>
        <Button type="button" size="sm" variant="outline" disabled={busy || !secret} onClick={() => void load()}>
          {busy ? "Memuat…" : "Muat ulang"}
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        Antrean Videy: kirim terakhir {wib(flush?.at)}
        {typeof flush?.entries === "number" ? `, ${flush.entries} video` : ""}
        {typeof flush?.committed === "number" ? `, ${flush.committed} masuk` : ""}. Video baru tayang setelah deploy selesai.
      </p>
      {note ? <p className="mt-2 text-xs text-zinc-400">{note}</p> : null}
      {rows.length ? (
        <ul className="mt-2 max-h-96 divide-y divide-white/[0.06] overflow-y-auto">
          {rows.map((r) => (
            <li key={`${r.host}:${r.id}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs text-zinc-300">
              <span className="min-w-0 flex-1">
                <span className="mr-1.5 text-zinc-500">{r.host}</span>
                {r.status === "live" ? (
                  <a href={`/watch/${r.id}`} target="_blank" rel="noopener" className="hover:underline">
                    {r.title}
                  </a>
                ) : (
                  <span>{r.title}</span>
                )}
                <span className="ml-1.5 text-zinc-500">{wib(r.at)}</span>
              </span>
              <span className={`shrink-0 ${color(r.status)}`}>
                {label(r.status)}
                {r.reason ? ` (${r.reason})` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : data ? (
        <p className="mt-2 text-xs text-zinc-500">Belum ada.</p>
      ) : null}
    </div>
  );
}

/**
 * Owner card: Telegram webhook status (registered url, pending updates, last error, last verified
 * update) + "Pasang ulang pengaman" which re-registers the webhook with its secret token.
 * Talks to /api/owner-tools with the owner key in the x-online-key header.
 */
export function OwnerTelegramStatus({ secret }: { secret: string }) {
  const [data, setData] = useState<WebhookResponse | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(action: "telegram-webhook-info" | "telegram-webhook-setup") {
    setBusy(true);
    setNote(action === "telegram-webhook-setup" ? "Memasang pengaman webhook…" : "Mengecek status bot…");
    try {
      const res = await fetch("/api/owner-tools", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action }),
      });
      const d = (await res.json().catch(() => null)) as WebhookResponse | null;
      if (!d) {
        setNote("Gagal membaca jawaban server.");
        return;
      }
      if (d.error === "forbidden") {
        setNote("Kunci salah.");
        return;
      }
      setData(d);
      if (!d.ok) setNote(`Gagal: ${d.error || "tidak diketahui"}`);
      else if (action === "telegram-webhook-setup") setNote("Pengaman webhook terpasang.");
      else setNote("");
    } catch {
      setNote("Jaringan error.");
    } finally {
      setBusy(false);
    }
  }

  const info = data?.info || null;
  const healthy = Boolean(data?.ok && data.urlOk && info && !info.lastErrorMessage);

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
      <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Bot Telegram</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void call("telegram-webhook-info")}>
          Cek status
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={() => void call("telegram-webhook-setup")}>
          Pasang ulang pengaman
        </Button>
      </div>
      {note ? <p className="mt-2 text-xs text-zinc-400">{note}</p> : null}
      {data ? (
        <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs text-zinc-300">
          <dt className="text-zinc-500">Status</dt>
          <dd className={healthy ? "text-emerald-400" : "text-amber-400"}>{healthy ? "Aman & aktif" : "Perlu dicek"}</dd>
          <dt className="text-zinc-500">URL webhook</dt>
          <dd className="break-all">
            {info?.url || "—"} {data.urlOk ? "(ok)" : `(harusnya ${data.expectedUrl || "/api/telegram"})`}
          </dd>
          <dt className="text-zinc-500">Antrian</dt>
          <dd>{info ? info.pendingUpdateCount : "—"}</dd>
          <dt className="text-zinc-500">Error terakhir</dt>
          <dd className="break-all">
            {info?.lastErrorMessage ? `${info.lastErrorMessage} (${wib(info.lastErrorDate)})` : "Tidak ada"}
          </dd>
          <dt className="text-zinc-500">Pengaman dipasang</dt>
          <dd>{wib(data.lastSetupAt)}</dd>
          <dt className="text-zinc-500">Pesan admin terakhir</dt>
          <dd>{wib(data.lastVerifiedUpdateAt)}</dd>
        </dl>
      ) : null}
      <RecentUploads secret={secret} />
    </section>
  );
}
