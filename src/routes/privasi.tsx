import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { SITE_ORIGIN } from "@/lib/seo";

export const Route = createFileRoute("/privasi")({
  head: () => ({
    meta: [
      { title: "Kebijakan Privasi | Dr. Pinguin" },
      { name: "description", content: "Kebijakan privasi Dr. Pinguin." },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/privasi` }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalPage title="Kebijakan Privasi">
      <p>
        Kami menyimpan preferensi usia (cookie/localStorage) agar gerbang 18+ tidak muncul setiap kunjungan.
      </p>
      <p>
        Analitik agregat dapat dipakai untuk memahami trafik. Kami tidak menjual data pribadi.
      </p>
      <p>Thumbnail diproksi dari host yang diizinkan agar poster tampil tanpa membuka sumber langsung.</p>
    </LegalPage>
  );
}
