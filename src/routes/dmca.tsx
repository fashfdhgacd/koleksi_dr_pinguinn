import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { SITE_ORIGIN } from "@/lib/seo";

export const Route = createFileRoute("/dmca")({
  head: () => ({
    meta: [
      { title: "DMCA | Dr. Pinguin" },
      { name: "description", content: "Prosedur DMCA Dr. Pinguin." },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/dmca` }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalPage title="DMCA">
      <p>
        Jika Anda pemegang hak dan ingin judul dihapus dari katalog, kirim pemberitahuan ke halaman
        Kontak dengan URL watch, bukti kepemilikan, dan pernyataan itikad baik.
      </p>
      <p>Kami meninjau laporan yang lengkap dan menghapus entri katalog yang sah tanpa meng-host ulang berkas video.</p>
    </LegalPage>
  );
}
