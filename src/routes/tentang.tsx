import { usePublicHref } from "@/lib/public-ui";
import { usePublicText } from "@/lib/public-ui";
import { Link, createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { jsonLdString } from "@/lib/json-ld";
import {
  ABOUT_DESCRIPTION,
  ABOUT_TITLE,
  DEFAULT_OG,
  HOME_CANONICAL,
  SITE_NAME,
  SITE_ORIGIN,
  breadcrumbJsonLd,
} from "@/lib/seo";

const URL_ABOUT = `${SITE_ORIGIN}/tentang`;

export const Route = createFileRoute("/tentang")({
  head: () => ({
    meta: [
      { title: ABOUT_TITLE },
      { name: "description", content: ABOUT_DESCRIPTION },
      { property: "og:title", content: ABOUT_TITLE },
      { property: "og:description", content: ABOUT_DESCRIPTION },
      { property: "og:url", content: URL_ABOUT },
      { property: "og:type", content: "website" },
      { property: "og:image", content: DEFAULT_OG },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: URL_ABOUT }],
    scripts: [
      {
        type: "application/ld+json",
        children: jsonLdString({
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: ABOUT_TITLE,
          url: URL_ABOUT,
          description: ABOUT_DESCRIPTION,
          inLanguage: "id",
          isPartOf: { "@id": `${HOME_CANONICAL}#website` },
          about: { "@id": `${HOME_CANONICAL}#organization` },
        }),
      },
      {
        type: "application/ld+json",
        children: jsonLdString(
          breadcrumbJsonLd([
            { name: SITE_NAME, url: HOME_CANONICAL },
            { name: "Tentang", url: URL_ABOUT },
          ]),
        ),
      },
    ],
  }),
  component: Page,
});

function Page() {
  const publicHref = usePublicHref();
  const localText = usePublicText();
  return (
    <LegalPage title={`Tentang ${SITE_NAME}`}>
      <p>
        <strong>Koleksi Dr. Pinguin</strong> {localText("(juga dikenal sebagai Dr. Pinguin, Koleksi Dr Pinguin, atau Koleksi Dr. Pinguin Bokep, M.S.B.) adalah situs resmi di")} <strong>koleksidrpinguin.com</strong>{localText(". Kami mengkurasi katalog video dewasa 18+ sendiri: bokep indo viral, video viral videy, JAV, dan AI Drama, yang bisa langsung ditonton di HP.")}
      </p>
      <h2 className="pt-2 text-lg font-semibold text-foreground">{localText("Situs asli vs. situs penyalin")}</h2>
      <p>
        {localText("Banyak situs menyalin judul dan daftar video kami. Satu-satunya alamat resmi adalah")}{" "}
        <a className="underline" href={publicHref(HOME_CANONICAL)}>
          koleksidrpinguin.com
        </a>
        {localText(". Setiap video di sini punya halaman tonton sendiri dengan tanggal unggah asli, dan feed")}{" "}
        <a className="underline" href={publicHref("/rss.xml")}>
          RSS
        </a>{" "}
        {localText("kami mencatat kapan video pertama kali terbit.")}
      </p>
      <h2 className="pt-2 text-lg font-semibold text-foreground">{localText("Mulai menjelajah")}</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <Link className="underline" to="/">
            {localText("Video terbaru")}
          </Link>
        </li>
        <li>
          <Link className="underline" to="/kategori">
            {localText("Semua kategori")}
          </Link>
        </li>
        <li>
          <a className="underline" href={publicHref("/kategori/paling-ditonton")}>
            {localText("Paling banyak ditonton")}
          </a>
        </li>
      </ul>
      <h2 className="pt-2 text-lg font-semibold text-foreground">{localText("Aturan konten")}</h2>
      <p>
        {localText("Situs ini khusus untuk pengunjung berusia 18 tahun ke atas. Semua pemeran yang tampil harus dewasa; konten yang melibatkan anak di bawah umur tidak pernah diterbitkan. Lihat juga")}{" "}
        <Link className="underline" to="/2257">
          2257
        </Link>
        ,{" "}
        <Link className="underline" to="/syarat">
          {localText("Syarat")}
        </Link>
        {localText(", dan")}{" "}
        <Link className="underline" to="/privasi">
          {localText("Privasi")}
        </Link>
        .
      </p>
      <h2 className="pt-2 text-lg font-semibold text-foreground">{localText("Kontak")}</h2>
      <p>
        {localText("Untuk DMCA atau laporan tautan rusak:")}{" "}
        <a className="underline" href="mailto:dmca@koleksidrpinguin.com">
          dmca@koleksidrpinguin.com
        </a>
        .
      </p>
    </LegalPage>
  );
}
