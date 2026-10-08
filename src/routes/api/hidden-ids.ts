import { createFileRoute } from "@tanstack/react-router";
import { unpublishedIds } from "@/lib/owner-review-store";
import { readUnhideState } from "@/lib/catalog/unhide-store";
import { readOwnerHideState } from "@/lib/catalog/owner-hide-store";

/**
 * Publik, hanya id (tanpa judul/alasan/data review):
 *  - ids: id yang di-set 'Tidak publish' (filter navigasi client)
 *  - unhidden: id yang dipulihkan pemilik lewat "Unhide" di /pemilik (video ini memang tampil publik lagi),
 *    dipakai katalog di browser supaya navigasi client sama dengan SSR.
 *  - ownerHidden: id yang disembunyikan pemilik dari kartu "Player error" (hanya ada kalau KV terbaca;
 *    kalau tidak ada, browser memakai daftar sebelumnya).
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
        let ownerHidden: string[] | undefined;
        try {
          ownerHidden = Object.keys((await readOwnerHideState()).ids);
        } catch {
          ownerHidden = undefined;
        }
        return Response.json(
          ownerHidden ? { ids, unhidden, ownerHidden } : { ids, unhidden },
          { headers: { "cache-control": "public, max-age=30", "x-robots-tag": "noindex" } },
        );
      },
    },
  },
});
