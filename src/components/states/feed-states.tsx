import { AlertTriangle, Film } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title = "Tidak ada film",
  description = "Coba kata kunci atau kategori lain.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <Film className="size-8 text-muted" />
      <h2 className="font-display text-2xl text-foreground">{title}</h2>
      <p className="max-w-sm text-sm text-muted">{description}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <div>
        <h2 className="font-display text-2xl text-foreground">Katalog sedang bermasalah</h2>
        <p className="mt-2 max-w-sm text-sm text-muted">{message}</p>
      </div>
      <Button onClick={onRetry}>Coba lagi</Button>
    </div>
  );
}
