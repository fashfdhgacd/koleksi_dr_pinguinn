import { usePublicLanguage } from "@/lib/public-ui";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "Terjadi kesalahan. Muat ulang halaman untuk mencoba lagi.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const language = usePublicLanguage();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <span className="text-destructive" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-2xl">{language === "ms" ? "Ralat berlaku" : language === "en" ? "Something went wrong" : "Ada yang salah"}</h1>
      <p className="max-w-md text-sm break-words text-muted">{language === "id" ? errorMessage(error) : language === "ms" ? "Muat semula halaman untuk mencuba lagi." : "Reload the page to try again."}</p>
    </main>
  );
}
