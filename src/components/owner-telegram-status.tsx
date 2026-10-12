"use client";

import { useState } from "react";
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
    </section>
  );
}
