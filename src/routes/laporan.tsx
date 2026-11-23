import { usePublicText } from "@/lib/public-ui";
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
  ncsei: "Konten intim tanpa persetujuan",
  copyright: "Pelanggaran hak cipta",
  illegal: "Konten ilegal",
  other: "Lainnya",
};

const CATEGORY_ORDER = ["minor", "ncsei", "copyright", "illegal", "other"] as const;

type PublicCategory = { reason: string; actioned: number; rejected: number; removed: number };
type PublicReport = { date: string; reason: string; outcome: "actioned" | "rejected" };

function TransparencyList() {
  const localText = usePublicText();
  const [data, setData] = useState<{
    totals: { actioned: number; rejected: number; removed: number };
    categories: PublicCategory[];
    items: PublicReport[];
  } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/reports-public", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.ok)
          setData({
            totals: j.totals || { actioned: 0, rejected: 0, removed: 0 },
            categories: j.categories || [],
            items: j.items || [],
          });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return <p className="text-sm text-muted">{localText("Memuat…")}</p>;
  const byReason = new Map(data.categories.map((c) => [c.reason, c]));
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-3 py-2 font-medium">{localText("Kategori")}</th>
              <th className="px-3 py-2 text-right font-medium">{localText("Laporan ditindaklanjuti")}</th>
              <th className="px-3 py-2 text-right font-medium">{localText("Video ditindaklanjuti")}</th>
              <th className="px-3 py-2 text-right font-medium">{localText("Ditolak")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {CATEGORY_ORDER.map((key) => {
              const c = byReason.get(key);
              return (
                <tr key={key}>
                  <td className="px-3 py-2 text-foreground">{REASON_LABEL[key]}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{c?.actioned ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{c?.removed ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{c?.rejected ?? 0}</td>
                </tr>
              );
            })}
            <tr className="bg-secondary/30 font-semibold">
              <td className="px-3 py-2 text-foreground">Total</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{data.totals.actioned}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{data.totals.removed}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">{data.totals.rejected}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {data.items.length === 0 ? (
        <p className="text-sm text-muted">{localText("Belum ada laporan yang selesai ditinjau.")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {data.items.slice(0, 30).map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-muted">
                {it.date} · {REASON_LABEL[it.reason] || it.reason}
              </span>
              <span className="font-medium text-emerald-500">{localText("Ditindaklanjuti")}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        {localText("Hanya laporan yang sudah selesai ditinjau yang tampil di sini. Identitas pelapor, detail laporan, dan video terkait tidak pernah dipublikasikan.")}
      </p>
    </div>
  );
}

function Page() {
  const localText = usePublicText();
  return (
    <LegalPage title={localText("Laporan Transparansi Konten")}>
      <p>
        {localText("Kami meninjau setiap laporan konten terlarang yang masuk dari pengunjung. Laporan")} <strong>{localText("tidak pernah")}</strong> {localText("langsung menyembunyikan video — video hanya ditindaklanjuti setelah terbukti melanggar aturan, dan tindakan selalu bisa dibatalkan.")}
      </p>
      <p>
        {localText("Untuk melaporkan video, buka halaman videonya dan tekan tombol")} <strong>{localText("Laporkan")}</strong>{localText(". Pengunjung tidak dapat melihat hasil peninjauan laporannya sendiri.")}
      </p>
      <h2 className="pt-2 text-base font-semibold text-foreground">{localText("Tindakan yang sudah diambil")}</h2>
      <TransparencyList />
    </LegalPage>
  );
}
