import { useRouterState } from "@tanstack/react-router";
import { decodePublicPath, localizedPath, type PublicLanguage } from "./public-locale.ts";
import messages from "./public-messages.json" with { type: "json" };

const dictionary: Record<string, string[]> = messages;
export function translate(language: PublicLanguage, original: string, english?: string) {
  if (language === "id") return original;
  return language === "ms" ? (dictionary[original]?.[0] ?? original)
    : (english ?? dictionary[original]?.[1] ?? original);
}

export function usePublicLanguage() {
  return useRouterState({ select: s => decodePublicPath(s.location.publicHref.split(/[?#]/)[0]).language });
}

export function usePublicText() {
  const language = usePublicLanguage();
  return (original: string, english?: string) => translate(language, original, english);
}

export function usePublicHref() {
  const language = usePublicLanguage();
  return (href: string) => localizedPath(href, language);
}
