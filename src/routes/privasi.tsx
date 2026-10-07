import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { SITE_ORIGIN } from "@/lib/seo";

export const Route = createFileRoute("/privasi")({
  head: () => ({
    meta: [
      { title: "Kebijakan Privasi (Privacy Policy) | Dr. Pinguin" },
      {
        name: "description",
        content:
          "Kebijakan privasi Dr. Pinguin: data analitik anonim yang dikumpulkan, cookie gerbang usia 18+, embed pihak ketiga, dan cara menghubungi kami.",
      },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/privasi` }],
  }),
  component: Page,
});

function H2({ children }: { children: string }) {
  return <h2 className="pt-2 text-base font-semibold text-foreground">{children}</h2>;
}

function Page() {
  return (
    <LegalPage title="Kebijakan Privasi">
      <p className="text-xs text-muted/70">Terakhir diperbarui: 7 Oktober 2026</p>
      <p>
        Kebijakan ini menjelaskan data apa yang dikumpulkan saat Anda mengakses
        koleksidrpinguin.com (&ldquo;Dr. Pinguin&rdquo;, &ldquo;Situs&rdquo;) dan bagaimana data
        tersebut digunakan. Situs ini hanya untuk pengguna berusia 18 tahun ke atas.
      </p>

      <H2>1. Tanpa akun, tanpa data pribadi</H2>
      <p>
        Pengunjung tidak perlu membuat akun, dan kami tidak meminta nama, email, nomor telepon,
        atau data pembayaran. Kami tidak menjual, menyewakan, atau membagikan data pribadi kepada
        pihak lain untuk tujuan pemasaran.
      </p>

      <H2>2. Analitik anonim</H2>
      <p>Untuk memahami trafik dan memperbaiki situs, kami mencatat data analitik anonim berikut:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>halaman yang dibuka (page view) dan waktu kunjungan;</li>
        <li>
          ID pengunjung acak dan anonim yang disimpan di localStorage browser Anda (tidak terkait
          dengan identitas Anda);
        </li>
        <li>jenis perangkat dan browser (diturunkan dari user-agent);</li>
        <li>referrer (situs asal kunjungan) dan perkiraan negara bila tersedia.</li>
      </ul>
      <p>
        Data ini disimpan di Cloudflare D1/KV (infrastruktur Cloudflare) dan hanya dipakai dalam
        bentuk statistik agregat. Alamat IP dapat diproses sementara oleh server untuk pembatasan
        laju (anti-spam/bot), tetapi tidak disimpan di database analitik kami. Kami juga dapat
        memakai layanan analitik pihak ketiga yang tidak memakai cookie (Umami) untuk statistik
        agregat.
      </p>

      <H2>3. Cookie dan penyimpanan lokal</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Gerbang usia 18+</strong>: cookie <code>dp_age_ok</code> dan localStorage
          menyimpan konfirmasi bahwa Anda berusia 18+ agar gerbang usia tidak muncul setiap
          kunjungan (berlaku hingga 1 tahun).
        </li>
        <li>
          <strong>ID pengunjung anonim</strong>: localStorage untuk menghitung pengunjung unik dan
          pengunjung online.
        </li>
        <li>
          <strong>Cache poster</strong>: service worker dapat menyimpan thumbnail di cache browser
          agar halaman lebih cepat.
        </li>
      </ul>
      <p>
        Anda dapat menghapus cookie dan data situs kapan saja melalui pengaturan browser. Thumbnail
        diproksi dari host yang diizinkan agar poster tampil tanpa membuka sumber langsung.
      </p>

      <H2>4. Embed dan layanan pihak ketiga</H2>
      <p>
        Video diputar melalui pemutar embed dari layanan hosting pihak ketiga (misalnya Streamtape
        dan host embed lainnya). Saat Anda memutar video, layanan tersebut dapat mengumpulkan data
        (termasuk cookie, alamat IP, dan iklan) sesuai kebijakan privasi mereka sendiri. Kami tidak
        mengendalikan dan tidak bertanggung jawab atas praktik privasi pihak ketiga tersebut. Font
        dimuat dari Google Fonts.
      </p>

      <H2>5. Usia pengguna</H2>
      <p>
        Situs ini tidak ditujukan untuk siapa pun di bawah 18 tahun. Jika Anda belum berusia 18
        tahun, segera tinggalkan situs ini.
      </p>

      <H2>6. Kontak</H2>
      <p>
        Pertanyaan tentang privasi atau permintaan penghapusan data dapat dikirim melalui halaman{" "}
        <Link to="/kontak" className="underline">
          Kontak
        </Link>
        . Lihat juga{" "}
        <Link to="/syarat" className="underline">
          Syarat &amp; Ketentuan
        </Link>{" "}
        dan{" "}
        <Link to="/2257" className="underline">
          pernyataan 2257
        </Link>
        .
      </p>

      <H2>English summary</H2>
      <p>
        No accounts and no personal data are collected or sold. We record anonymous analytics (page
        views, a random anonymous visitor ID stored in localStorage, device/browser type, referrer,
        approximate country) in Cloudflare D1/KV, used only as aggregate statistics; IP addresses
        are processed transiently for rate limiting and not stored in our analytics database. A
        cookie/localStorage entry remembers your 18+ age confirmation. Videos are embedded from
        third-party hosts (e.g. Streamtape) which have their own privacy policies. Contact us via
        the Kontak page.
      </p>
    </LegalPage>
  );
}
