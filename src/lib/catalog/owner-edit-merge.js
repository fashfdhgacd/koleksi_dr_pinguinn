/**
 * Owner title edits always win and take effect at once (owner rule 2026-11-02).
 *
 * The stuck edit: KV reads are edge-cached (get: 60 s, readForWrite: 30 s). Right after an edit was
 * written, the route re-read the state to rebuild the catalog and could get the OLD copy, so the
 * rebuild applied the stale edits and the new title vanished in that isolate; a second quick edit
 * (title, then category) read the stale copy and wrote it back over the first one.
 * These helpers merge what this isolate just wrote over whatever the cached read returned.
 * Plain JS, no imports: testable with node --test.
 */

/**
 * @typedef {{ title?: string, category?: string, extra?: string[], at: number }} Edit
 * @typedef {Record<string, Edit>} EditMap
 */

/**
 * The edit map with the edit that was just saved for `id` (null = the save removed it).
 * @param {EditMap} ids state read back (possibly stale)
 * @param {string} id
 * @param {Edit | null | undefined} saved what setOwnerEdit wrote
 * @returns {EditMap}
 */
export function withSavedEdit(ids, id, saved) {
  const next = { ...(ids || {}) };
  if (saved) next[id] = saved;
  else if (saved === null) delete next[id];
  return next;
}

/**
 * Per id, the newer edit (by `at`) of a read and of this isolate's last write.
 * @param {EditMap} read
 * @param {EditMap | null} written
 * @returns {EditMap}
 */
export function newerEdits(read, written) {
  if (!written) return read || {};
  const out = { ...(read || {}) };
  for (const [id, e] of Object.entries(written)) {
    if (!out[id] || Number(out[id].at || 0) < Number(e?.at || 0)) out[id] = e;
  }
  return out;
}
