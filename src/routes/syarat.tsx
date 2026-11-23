import { usePublicText } from "@/lib/public-ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { SITE_ORIGIN } from "@/lib/seo";

export const Route = createFileRoute("/syarat")({
  head: () => ({
    meta: [
      { title: "Syarat & Ketentuan (Terms of Service) | Dr. Pinguin" },
      {
        name: "description",
        content:
          "Syarat & Ketentuan Dr. Pinguin: khusus 18+, tanggung jawab hukum lokal, konten pihak ketiga, DMCA, penghapusan konten, dan penafian.",
      },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/syarat` }],
  }),
  component: Page,
});

function H2({ children }: { children: string }) {
  return <h2 className="pt-2 text-base font-semibold text-foreground">{children}</h2>;
}

function Page() {
  const localText = usePublicText();
  return (
    <LegalPage title={localText("Syarat & Ketentuan")}>
      <p className="text-xs text-muted/70">{localText("Terakhir diperbarui: 7 Oktober 2026")}</p>
      <p>
        {localText("Dengan mengakses atau menggunakan koleksidrpinguin.com (“Dr. Pinguin”, “Situs”), Anda menyetujui Syarat & Ketentuan berikut. Jika tidak setuju, jangan gunakan Situs ini.")}
      </p>

      <H2>{localText("1. Khusus dewasa 18+")}</H2>
      <p>
        {localText("Situs ini berisi materi dewasa dan hanya untuk pengguna berusia minimal 18 tahun (atau usia dewasa yang berlaku di wilayah Anda, mana yang lebih tinggi). Dengan masuk, Anda menyatakan telah memenuhi batas usia tersebut dan tidak tersinggung oleh materi seksual eksplisit.")}
      </p>

      <H2>{localText("2. Tanggung jawab atas hukum setempat")}</H2>
      <p>
        {localText("Anda bertanggung jawab memastikan bahwa mengakses materi dewasa sah menurut hukum di negara/wilayah tempat Anda berada. Dilarang menggunakan Situs untuk aktivitas ilegal. Pengelola dapat membatasi atau menolak akses sewaktu-waktu.")}
      </p>

      <H2>{localText("3. Konten pihak ketiga")}</H2>
      <p>
        {localText("Situs ini adalah katalog tautan dan embed. Kami tidak memproduksi, tidak mengunggah, dan tidak meng-host file video. Semua video di-host oleh layanan pihak ketiga (misalnya Streamtape dan host embed lainnya). Kami tidak mengklaim kepemilikan atas konten tersebut, tidak mengendalikannya, dan tidak menjamin ketersediaan maupun keakuratan sumber eksternal. Lihat")}{" "}
        <Link to="/2257" className="underline">
          {localText("pernyataan 2257")}
        </Link>
        .
      </p>

      <H2>{localText("4. Konten terlarang dan penghapusan")}</H2>
      <p>
        {localText("Kami menerapkan kebijakan tanpa toleransi terhadap konten yang melibatkan siapa pun di bawah 18 tahun dan konten tanpa persetujuan (non-konsensual). Jika Anda menemukan konten bermasalah, laporkan melalui halaman")}{" "}
        <Link to="/kontak" className="underline">
          {localText("Kontak")}
        </Link>{" "}
        {localText("beserta URL halamannya; entri yang dilaporkan akan ditinjau dan dihapus dari katalog bila terbukti melanggar.")}
      </p>

      <H2>{localText("5. Hak cipta (DMCA)")}</H2>
      <p>
        {localText("Pemegang hak cipta dapat mengajukan permintaan penghapusan sesuai prosedur di halaman")}{" "}
        <Link to="/dmca" className="underline">
          DMCA
        </Link>
        .
      </p>

      <H2>{localText("6. Privasi")}</H2>
      <p>
        {localText("Penggunaan data dijelaskan dalam")}{" "}
        <Link to="/privasi" className="underline">
          {localText("Kebijakan Privasi")}
        </Link>
        .
      </p>

      <H2>{localText("7. Penafian")}</H2>
      <p>
        {localText("Situs disediakan “sebagaimana adanya” tanpa jaminan apa pun. Pengelola tidak bertanggung jawab atas kerugian yang timbul dari penggunaan Situs atau dari konten, iklan, maupun tautan pihak ketiga. Syarat ini dapat diubah sewaktu-waktu; versi terbaru selalu tersedia di halaman ini.")}
      </p>

      <H2>{localText("English summary")}</H2>
      <p>
        Adults 18+ only. You are responsible for complying with the laws of your location. The Site
        is a catalog of links/embeds to third-party hosted videos; we do not own, produce, or host
        that content. Zero tolerance for content involving anyone under 18 or non-consensual
        content &mdash; reported entries are removed. Copyright notices via the DMCA page. The Site
        is provided &ldquo;as is&rdquo; without warranties.
      </p>
    </LegalPage>
  );
}
