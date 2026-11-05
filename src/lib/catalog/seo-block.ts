/**
 * Ids removed from the public catalog (src/lib/catalog/catalog-blocklist.json).
 * SEO surfaces skip these ids only. A school-word JAV title is not excluded here:
 * those hits belong in the owner review queue, and a restored id leaves this set
 * when the blocklist file drops it. /watch for a listed id stays 410.
 */
import blockFile from "./catalog-blocklist.json";
import { blockedIdSet, isBlockedId } from "./catalog-block.js";

const FILE_BLOCKED = blockedIdSet(blockFile);

export function isSeoBlockedId(id: string | null | undefined): boolean {
  return isBlockedId(String(id || ""), FILE_BLOCKED);
}

export function seoBlockedIdSet(): Set<string> {
  return FILE_BLOCKED;
}
