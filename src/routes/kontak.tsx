import { usePublicText } from "@/lib/public-ui";
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
  const localText = usePublicText();
  return (
    <LegalPage title={localText("Kontak")}>
      <p>{localText("Untuk DMCA, privasi, atau laporan tautan rusak, tulis ke:")}</p>
      <p>
        <a className="underline" href="mailto:dmca@koleksidrpinguin.com">
          dmca@koleksidrpinguin.com
        </a>
      </p>
      <p>{localText("Sertakan URL halaman dan ringkasan singkat. Jangan kirim berkas video.")}</p>
    </LegalPage>
  );
}
