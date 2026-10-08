import { createFileRoute } from "@tanstack/react-router";
import { unpublishedIds } from "@/lib/owner-review-store";
import { readUnhideState } from "@/lib/catalog/unhide-store";

/**
 * Publik, hanya id (tanpa judul/alasan/data review):
 *  - ids: id yang di-set 'Tidak publish' (filter navigasi client)
 *  - unhidden: id yang dipulihkan pemilik lewat "Unhide" di /pemilik (video ini memang tampil publik lagi),
 *    dipakai katalog di browser supaya navigasi client sama dengan SSR.
 */
export const Route = createFileRoute("/api/hidden-ids")({
  server: {
    handlers: {
      GET: async () => {
        const ids = [...(await unpublishedIds())];
        let unhidden: string[] = [];
        try {
          unhidden = Object.keys((await readUnhideState()).ids);
        } catch {
          unhidden = [];
        }
        return Response.json(
          { ids, unhidden },
          { headers: { "cache-control": "public, max-age=30", "x-robots-tag": "noindex" } },
        );
      },
    },
  },
});
