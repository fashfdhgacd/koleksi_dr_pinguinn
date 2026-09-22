import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { SITE_ORIGIN } from "@/lib/seo";

export const Route = createFileRoute("/kontak")({
  head: () => ({
    meta: [
      { title: "Kontak | Dr. Pinguin" },
      { name: "description", content: "Hubungi pengelola Dr. Pinguin." },
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
