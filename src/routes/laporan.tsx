import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LegalPage } from "@/components/legal-page";
import { SITE_ORIGIN } from "@/lib/seo";

export const Route = createFileRoute("/laporan")({
  head: () => ({
    meta: [
      { title: "Laporan Transparansi Konten | Koleksi Dr. Pinguin" },
      {
        name: "description",
        content:
          "Laporan transparansi moderasi konten Koleksi Dr. Pinguin: jumlah laporan yang ditindaklanjuti dan ditolak, tanpa data sensitif.",
      },
      { property: "og:title", content: "Laporan Transparansi Konten | Koleksi Dr. Pinguin" },
      { property: "og:url", content: `${SITE_ORIGIN}/laporan` },
      { property: "og:type", content: "website" },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/laporan` }],
  }),
  component: Page,
});

const REASON_LABEL: Record<string, string> = {
  minor: "Dugaan di bawah umur",
  illegal: "Konten ilegal",
  other: "Lainnya",
};

type PublicReport = { date: string; reason: string; outcome: "actioned" | "rejected" };

function TransparencyList() {
  const [data, setData] = useState<{ totals: { actioned: number; rejected: number }; items: PublicReport[] } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/reports-public", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.ok) setData({ totals: j.totals || { actioned: 0, rejected: 0 }, items: j.items || [] });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return <p className="text-sm text-muted">Memuat…</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground">
        Total ditindaklanjuti: <strong>{data.totals.actioned}</strong> · Total ditolak:{" "}
        <strong>{data.totals.rejected}</strong>
      </p>
      {data.items.length === 0 ? (
        <p className="text-sm text-muted">Belum ada laporan yang selesai ditinjau.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {data.items.slice(0, 30).map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-muted">
                {it.date} · {REASON_LABEL[it.reason] || it.reason}
              </span>
              <span className={it.outcome === "actioned" ? "font-medium text-emerald-500" : "font-medium text-muted"}>
                {it.outcome === "actioned" ? "Ditindaklanjuti" : "Ditolak"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        Hanya laporan yang sudah selesai ditinjau yang tampil di sini. Identitas pelapor, detail laporan,
        dan video terkait tidak pernah dipublikasikan.
      </p>
    </div>
  );
}

function Page() {
  return (
    <LegalPage title="Laporan Transparansi Konten">
      <p>
        Kami meninjau setiap laporan konten terlarang yang masuk dari pengunjung. Laporan <strong>tidak
        pernah</strong> langsung menyembunyikan video — video hanya ditindaklanjuti setelah terbukti
        melanggar aturan, dan tindakan selalu bisa dibatalkan.
      </p>
      <p>
        Untuk melaporkan video, buka halaman videonya dan tekan tombol <strong>Laporkan</strong>. Pengunjung
        tidak dapat melihat hasil peninjauan laporannya sendiri.
      </p>
      <h2 className="pt-2 text-base font-semibold text-foreground">Tindakan yang sudah diambil</h2>
      <TransparencyList />
    </LegalPage>
  );
}
