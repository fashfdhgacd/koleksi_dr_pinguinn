/**
 * Blocked ids for ingest. Bundled repo file plus the live KV list (read only).
 * A KV miss keeps the file list, so a removed id is not written back into a feed.
 */
import blockFile from "@/lib/catalog/catalog-blocklist.json";
import { blockedIdSet } from "@/lib/catalog/catalog-block.js";
import { readCatalogBlockState } from "@/lib/catalog/catalog-block-store";

export async function ingestBlockedIds(): Promise<Set<string>> {
  const ids = blockedIdSet(blockFile);
  try {
    const state = await readCatalogBlockState();
    for (const id of Object.keys(state.ids)) {
      ids.add(id);
      ids.add(id.toLowerCase());
    }
  } catch {
    /* KV unreachable: the repo file still applies */
  }
  return ids;
}
