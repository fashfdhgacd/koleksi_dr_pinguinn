import type { ReactNode } from "react";
import { Shell } from "@/components/layout/shell";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Shell>
      <article className="mx-auto max-w-3xl space-y-4">
        <h1 className="font-display text-3xl text-foreground sm:text-4xl">{title}</h1>
        <div className="space-y-3 text-sm leading-relaxed text-muted">{children}</div>
      </article>
    </Shell>
  );
}
