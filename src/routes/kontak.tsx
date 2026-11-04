import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { SITE_ORIGIN } from "@/lib/seo";

export const Route = createFileRoute("/kontak")({
  head: () => ({
    meta: [
      { title: "Kontak Pengelola | Koleksi Dr. Pinguin" },
      {
        name: "description",
        content:
          "Hubungi pengelola Koleksi Dr. Pinguin untuk laporan DMCA, permintaan penghapusan, pertanyaan privasi, atau tautan video yang rusak.",
      },
      { property: "og:title", content: "Kontak Pengelola | Koleksi Dr. Pinguin" },
      { property: "og:url", content: `${SITE_ORIGIN}/kontak` },
      { property: "og:type", content: "website" },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/kontak` }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalPage title="Kontak">
      <p>Untuk DMCA, privasi, atau laporan tautan rusak, tulis ke:</p>
      <p>
        <a className="underline" href="mailto:dmca@koleksidrpinguin.com">
          dmca@koleksidrpinguin.com
        </a>
      </p>
      <p>Sertakan URL halaman dan ringkasan singkat. Jangan kirim berkas video.</p>
    </LegalPage>
  );
}
