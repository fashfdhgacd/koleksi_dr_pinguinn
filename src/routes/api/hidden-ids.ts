import { createFileRoute } from "@tanstack/react-router";
import { unpublishedIds } from "@/lib/owner-review-store";
import { readUnhideState } from "@/lib/catalog/unhide-store";
import { readOwnerHideState } from "@/lib/catalog/owner-hide-store";
import { readOwnerEditState } from "@/lib/catalog/owner-edit-store";

/**
 * Publik, hanya id (tanpa judul/alasan/data review):
 *  - ids: id yang di-set 'Tidak publish' (filter navigasi client)
 *  - unhidden: id yang dipulihkan pemilik lewat "Unhide" di /pemilik (video ini memang tampil publik lagi),
 *    dipakai katalog di browser supaya navigasi client sama dengan SSR.
 *  - ownerHidden: id yang disembunyikan pemilik dari kartu "Player error" (hanya ada kalau KV terbaca;
 *    kalau tidak ada, browser memakai daftar sebelumnya).
 *  - edits: judul/kategori yang diubah pemilik lewat "Edit" di /pemilik, supaya navigasi client
 *    menampilkan judul yang sama dengan SSR. Edit hanya bisa dibuat untuk video yang tidak terkunci
 *    dan tidak ditandai (owner-tools.ts).
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
        let edits: Record<string, { title?: string; category?: string; extra?: string[] }> | undefined;
        try {
          edits = {};
          for (const [id, e] of Object.entries((await readOwnerEditState()).ids)) {
            edits[id] = {
              ...(e.title ? { title: e.title } : {}),
              ...(e.category ? { category: e.category } : {}),
              ...(e.extra?.length ? { extra: e.extra } : {}),
            };
          }
        } catch {
          edits = undefined;
        }
        return Response.json(
          {
            ids,
            unhidden,
            ...(ownerHidden ? { ownerHidden } : {}),
            ...(edits ? { edits } : {}),
          },
          { headers: { "cache-control": "public, max-age=30", "x-robots-tag": "noindex" } },
        );
      },
    },
  },
});
