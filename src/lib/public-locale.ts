export type PublicLanguage = "ms" | "id" | "en";
export const languageCodes = { ms: "ms-MY", id: "id", en: "en" } as const;
const publicPage = /^\/(?:$|(?:kategori|genre|cari|halaman|watch|v|tentang|kontak|syarat|terms|privacy|privasi|2257|dmca|teman|laporan|kirim|campur|putarin)(?:\/|$))/;

export function decodePublicPath(path: string): { language: PublicLanguage; path: string } {
  const collection = /^\/(ms|id)\/collections\/([a-z0-9-]+(?:\/halaman\/[1-9]\d*)?)\/?$/.exec(path);
  if (collection) return { language: collection[1] as PublicLanguage, path: "/en/" + collection[2] };
  if (path === "/") return { language: "ms", path };
  if (path === "/id" || path === "/id/") return { language: "id", path: "/" };
  if (path === "/en/home") return { language: "en", path: "/" };
  for (const language of ["ms", "en"] as const) {
    if (path === "/" + language || path.startsWith("/" + language + "/")) {
      const rest = path.slice(3) || "/";
      // /en and /en/<keyword> already have dedicated route loaders.
      if (language === "en" && (rest === "/" || !publicPage.test(rest))) return { language, path };
      if (publicPage.test(rest)) return { language, path: rest };
    }
  }
  return { language: "id", path };
}

export function localizedPath(path: string, language: PublicLanguage): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const [, raw, suffix] = /^([^?#]*)(.*)$/.exec(path)!;
  const decoded = decodePublicPath(raw).path;
  if (decoded === "/en" || decoded === "/en/") return language === "en" ? "/en" + suffix : localizedPath("/cari" + suffix, language);
  if (decoded.startsWith("/en/")) return (language === "en" ? decoded : "/" + language + "/collections/" + decoded.slice(4)) + suffix;
  if (!publicPage.test(decoded)) return path;
  if (decoded === "/") return ({ ms: "/ms", id: "/id", en: "/en/home" }[language]) + suffix;
  return (language === "id" ? "" : "/" + language) + decoded + suffix;
}

export function localeRewrites() {
  // One instance per router/request, including during server rendering.
  let language: PublicLanguage = "ms";
  return {
    input: ({ url }: { url: URL }) => {
      const decoded = decodePublicPath(url.pathname);
      language = decoded.language;
      url.pathname = decoded.path;
      return url;
    },
    output: ({ url }: { url: URL }) => {
      url.pathname = localizedPath(url.pathname, language);
      return url;
    },
  };
}
