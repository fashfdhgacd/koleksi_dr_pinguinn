import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { SITE_ORIGIN } from "@/lib/seo";

export const Route = createFileRoute("/syarat")({
  head: () => ({
    meta: [
      { title: "Syarat Layanan | Dr. Pinguin" },
      { name: "description", content: "Syarat layanan Dr. Pinguin. Konten 18+." },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/syarat` }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalPage title="Syarat Layanan">
      <p>Dengan mengakses koleksidrpinguin.com Anda menyatakan berusia minimal 18 tahun.</p>
      <p>
        Situs ini adalah katalog tautan embed pihak ketiga. Kami tidak meng-host file video dan tidak
        menjamin ketersediaan sumber eksternal.
      </p>
      <p>Dilarang menggunakan situs ini untuk aktivitas ilegal. Pengelola dapat menolak akses sewaktu-waktu.</p>
    </LegalPage>
  );
}
