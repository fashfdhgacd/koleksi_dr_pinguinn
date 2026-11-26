import { languageFamily } from "../language-family.ts";
import { collectionBlurb, collectionHeading, collectionIntro, collectionLabel } from "../page-copy.ts";
import { decodePublicPath, languageCodes, localizedPath, type PublicLanguage } from "../public-locale.ts";
import { findCategory } from "./categories.ts";
import { categorySeo } from "./category-seo.ts";
import { findEnLanding } from "./en-landing.ts";
import { findLanding } from "./landing.ts";
import { overviewCopy } from "./overview-copy.ts";

// Same values as SITE_ORIGIN and SITE_NAME. Local so node:test can load this file without seo.ts.
const SITE_ORIGIN = "https://koleksidrpinguin.com";
const SITE_NAME = "Koleksi Dr. Pinguin";

export type ListingCopy = { heading: string; title: string; description: string; intro: string };

export type HreflangLink = { rel: "alternate"; hreflang: string; href: string };

/** "/halaman/N" and "/<section>/<slug>/halaman/N" share the page-1 document. */
export function splitListing(path: string): { base: string; page: number } {
  const bare = path.split(/[?#]/)[0] || "/";
  const home = /^\/halaman\/([1-9]\d*)$/.exec(bare);
  if (home) return { base: "/", page: Number(home[1]) };
  const nested = /^(.*)\/halaman\/([1-9]\d*)$/.exec(bare);
  if (nested?.[1]) return { base: nested[1], page: Number(nested[2]) };
  return { base: bare, page: 1 };
}

export function pageSuffix(language: PublicLanguage, page: number): string {
  if (page <= 1) return "";
  return language === "en" ? ` – Page ${page}` : ` – Halaman ${page}`;
}

function withSuffix(copy: { heading: string; title: string; description: string; intro: string }, language: PublicLanguage, page: number): ListingCopy {
  const heading = copy.heading + pageSuffix(language, page);
  return { heading, title: `${heading} | ${SITE_NAME}`, description: copy.description, intro: copy.intro };
}

/**
 * Title, description and H1 for a catalog listing. Page 1 of a curated category uses the
 * same overview copy as PR #261. Later pages keep that wording and add a localized page suffix.
 * Categories without curated copy keep their page-1 heading and description.
 */
export function listingDocument(internalPath: string, language: PublicLanguage, total?: number): ListingCopy | null {
  const { base, page } = splitListing(internalPath);
  const suffix = pageSuffix(language, page);
  const overview = overviewCopy(base, language, total);
  if (overview) return withSuffix(overview, language, page);

  const category = /^\/kategori\/([^/]+)$/.exec(base);
  if (category && page > 1 && findCategory(category[1])) {
    if (language === "id") {
      const seo = categorySeo(category[1]);
      const head = seo.title.replace(/\s*\|\s*koleksidrpinguin\.com\s*$/i, "");
      return { heading: seo.h1 + suffix, title: `${head}${suffix} | ${SITE_NAME}`, description: seo.description, intro: seo.intro };
    }
    const label = collectionLabel(category[1], language);
    const name = /^koleksi\b/i.test(label) ? label : `koleksi ${label}`;
    const intro = language === "ms" ? `Terokai ${name} dan pilih video untuk ditonton.` : `Browse the ${label} collection.`;
    return { heading: label + suffix, title: `${label}${suffix} | ${SITE_NAME}`, description: collectionBlurb(label, language), intro };
  }

  const english = /^\/en\/([^/]+)$/.exec(base);
  if (english && page > 1) {
    const def = findEnLanding(english[1]);
    if (!def) return null;
    if (language === "en") {
      return { heading: def.h1 + suffix, title: `${def.title}${suffix} | ${SITE_NAME}`, description: def.description, intro: def.intro };
    }
    const label = collectionHeading(english[1], language, def.h1);
    const intro = collectionIntro(label, language);
    return { heading: label + suffix, title: `${label}${suffix} | ${SITE_NAME}`, description: intro, intro };
  }

  const cari = /^\/cari\/([^/]+)$/.exec(base);
  if (cari && page > 1) {
    const def = findLanding(cari[1]);
    if (!def) return null;
    if (language === "id") {
      const head = def.title.replace(/\s*\|\s*koleksidrpinguin\.com\s*$/i, "");
      return { heading: def.h1 + suffix, title: `${head}${suffix} | ${SITE_NAME}`, description: def.description, intro: def.intro };
    }
    const label = collectionLabel(cari[1], language);
    const intro = collectionBlurb(label, language);
    return { heading: label + suffix, title: `${label}${suffix} | ${SITE_NAME}`, description: intro, intro };
  }

  if ((base === "/" || base.startsWith("/kategori/")) && page > 1) return null;
  return null;
}

function localeResolves(publicPath: string, language: PublicLanguage): boolean {
  const bare = publicPath.split(/[?#]/)[0];
  const decoded = decodePublicPath(bare);
  if (decoded.language !== language) return false;
  if (decoded.path.startsWith("/id/")) return false;
  return localizedPath(decoded.path, language).split(/[?#]/)[0] === bare;
}

/** ms, id, en and x-default (the /ms URL). Omits a locale whose public URL does not resolve. */
export function hreflangAlternates(publicPath: string): HreflangLink[] {
  const clean = publicPath.split("#")[0];
  const cut = clean.indexOf("?");
  const pathname = cut === -1 ? clean : clean.slice(0, cut);
  const search = cut === -1 ? "" : clean.slice(cut);
  const internal = decodePublicPath(pathname).path;
  const urls = languageFamily(internal + search);
  const links: HreflangLink[] = [];
  for (const language of ["ms", "id", "en"] as const) {
    const path = urls[language];
    if (!localeResolves(path, language)) continue;
    links.push({ rel: "alternate", hreflang: languageCodes[language], href: new URL(path, SITE_ORIGIN).href });
  }
  const malay = links.find((link) => link.hreflang === languageCodes.ms);
  if (malay) links.push({ rel: "alternate", hreflang: "x-default", href: malay.href });
  return links;
}

/** Canonical of a public URL. Paginated pages point at themselves, on the same locale as page 1. */
export function canonicalHref(publicPath: string): string {
  const clean = publicPath.split("#")[0];
  const cut = clean.indexOf("?");
  const pathname = cut === -1 ? clean : clean.slice(0, cut);
  const search = cut === -1 ? "" : clean.slice(cut);
  const { language, path } = decodePublicPath(pathname);
  const urls = languageFamily(path + search);
  return new URL(urls[language], SITE_ORIGIN).href;
}
