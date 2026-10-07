import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { SITE_ORIGIN } from "@/lib/seo";

export const Route = createFileRoute("/2257")({
  head: () => ({
    meta: [
      { title: "18 U.S.C. 2257 Exemption Statement | Dr. Pinguin" },
      {
        name: "description",
        content:
          "18 U.S.C. 2257 exemption and compliance statement for koleksidrpinguin.com. The operator is not a primary or secondary producer of any content.",
      },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/2257` }],
  }),
  component: Page,
});

function Page() {
  return (
    <LegalPage title="18 U.S.C. 2257 Exemption Statement">
      <p className="text-xs text-muted/70">Last updated: 7 October 2026</p>

      <h2 className="pt-2 text-base font-semibold text-foreground">Exemption statement</h2>
      <p>
        koleksidrpinguin.com (&ldquo;Dr. Pinguin&rdquo;, &ldquo;the Site&rdquo;) is a catalog/index
        of links and embedded players. The operator of the Site is not a &ldquo;producer&rdquo;
        (primary or secondary) of any of the visual content that may be accessed through the Site,
        as that term is defined in 18 U.S.C. &sect; 2257 and 28 C.F.R. &sect; 75.
      </p>
      <p>
        The Site does not produce, film, commission, upload, or host video files. All videos shown
        on the Site are hosted by, and streamed from, independent third-party video hosting and
        embed services (for example Streamtape and other external embed hosts). The Site only
        displays titles, thumbnails, and links/embeds that point to those third-party services. The
        operator does not exercise editorial control over the content of those videos and its
        activities are limited to the transmission, storage, retrieval, hosting and/or formatting of
        depictions as described in 18 U.S.C. &sect; 2257(h)(2)(B)(v) and 47 U.S.C. &sect; 230(c).
      </p>

      <h2 className="pt-2 text-base font-semibold text-foreground">Age of persons depicted</h2>
      <p>
        According to the uploaders and hosting services, all persons who appear in any visual
        depiction accessible through the Site were 18 years of age or older at the time the
        depiction was created. Records required under 18 U.S.C. &sect; 2257 and 28 C.F.R. &sect; 75,
        where applicable, are maintained by the original producers of the content and/or the
        third-party hosts on which the content is stored &mdash; not by the operator of this Site.
        Inquiries about records should be directed to the original producer or host of the
        specific video.
      </p>

      <h2 className="pt-2 text-base font-semibold text-foreground">Zero-tolerance policy</h2>
      <p>
        The Site has a zero-tolerance policy toward any content involving persons under 18 years of
        age and toward any non-consensual content (including content recorded or shared without the
        consent of the persons depicted). Such content is strictly prohibited. Any catalog entry
        reported as violating this policy will be removed from the Site promptly upon review, and
        where appropriate the report will be forwarded to the hosting service and/or the relevant
        authorities.
      </p>

      <h2 className="pt-2 text-base font-semibold text-foreground">Reporting and removal</h2>
      <p>
        To report a video or request removal of a catalog entry, please contact us via the{" "}
        <Link to="/kontak" className="underline">
          Kontak
        </Link>{" "}
        page, including the full URL of the page on this Site and a short description of the issue.
        Copyright notices can be submitted following the{" "}
        <Link to="/dmca" className="underline">
          DMCA
        </Link>{" "}
        procedure.
      </p>

      <h2 className="pt-2 text-base font-semibold text-foreground">Ringkasan (Bahasa Indonesia)</h2>
      <p>
        Pengelola koleksidrpinguin.com bukan produsen (primer maupun sekunder) konten apa pun. Situs
        ini hanya katalog yang menampilkan judul, thumbnail, dan tautan/embed ke video yang di-host
        oleh layanan pihak ketiga (misalnya Streamtape). Menurut pengunggah dan host, semua orang
        yang tampil berusia 18 tahun ke atas saat produksi; catatan usia disimpan oleh produsen asli
        atau host terkait. Kami menolak keras konten yang melibatkan siapa pun di bawah 18 tahun
        maupun konten tanpa persetujuan &mdash; entri yang dilaporkan akan dihapus setelah ditinjau.
        Laporan dan permintaan penghapusan dapat dikirim melalui halaman{" "}
        <Link to="/kontak" className="underline">
          Kontak
        </Link>
        .
      </p>
    </LegalPage>
  );
}
