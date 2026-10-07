import { createFileRoute } from "@tanstack/react-router";
import { unpublishedIds } from "@/lib/owner-review-store";

/** Publik: hanya daftar id yang di-set 'Tidak publish' (tanpa judul/data review), untuk filter navigasi client. */
export const Route = createFileRoute("/api/hidden-ids")({
  server: {
    handlers: {
      GET: async () => {
        const ids = [...(await unpublishedIds())];
        return Response.json({ ids }, { headers: { "cache-control": "public, max-age=30" } });
      },
    },
  },
});
