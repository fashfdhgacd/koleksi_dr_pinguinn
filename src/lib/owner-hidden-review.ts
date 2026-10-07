import { loadItemsRaw } from "@/lib/catalog/local-cache";
import { slugOf, sourceLabel } from "@/lib/catalog/local-shared";
import { hasTocilTitle, isMinorCoded, isMinorCodedIgnoringTocil, matchedMinorTerms } from "@/lib/seo";
import { readReviewState, writeReviewState, type PublishState } from "@/lib/owner-review-store";

export type HiddenReviewRow = {
  id: string;
  title: string;
  terms: string[];
  /** true = satu-satunya istilah 'tocil' → boleh 'Publish'. */
  tocilOnly: boolean;
  source: string;
  category: string;
  status: string;
  watchUrl: string;
  sourceUrl: string | null;
  sourcePageUrl: string | null;
  checkedAt: number | null;
  firstSeen: number;
  publish: PublishState | null;
};

function isFlagged(it: { title?: unknown; tags?: unknown }): boolean {
  return isMinorCoded(it) || hasTocilTitle(it);
}

/** Server-side guard: 'Publish' hanya untuk item yang cuma kena 'tocil'. */
export function isTocilOnly(it: { title?: unknown; tags?: unknown }): boolean {
  return isFlagged(it) && !isMinorCodedIgnoringTocil(it);
}

function sourcePage(url: string): string | null {
  if (!/^https?:\/\//i.test(url)) return null;
  const st = url.match(/^https?:\/\/(?:www\.)?streamtape\.[a-z]+\/e\/([A-Za-z0-9]+)/i);
  if (st) return `https://streamtape.com/v/${st[1]}`;
  return null;
}

function statusOf(it: Parameters<typeof slugOf>[0], publish: PublishState | null): string {
  if (publish === "off") return "Tidak publish (dihapus dari situs publik)";
  const cat = slugOf(it);
  const minor = isMinorCoded(it);
  const real = isMinorCodedIgnoringTocil(it);
  const tocil = hasTocilTitle(it);
  if (cat === "18-25" && minor) return "Disembunyikan dari kategori 18-25";
  if (cat === "lainnya" && real) return "Disembunyikan dari kategori Lainnya";
  if (cat === "lainnya") return "Tampil di Lainnya, noindex";
  return `Tampil di ${cat}${tocil ? ", noindex" : " (tidak difilter)"}`;
}

/** Daftar item yang kena filter minor / judul 'tocil' + state review. */
export async function listHiddenForReview(): Promise<HiddenReviewRow[]> {
  const { items } = await loadItemsRaw();
  const state = await readReviewState(true);
  const now = Date.now();
  let dirty = false;
  const out: HiddenReviewRow[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!it?.id || seen.has(it.id) || !isFlagged(it)) continue;
    seen.add(it.id);
    if (!state.firstSeen[it.id]) {
      // Seed pertama: tandai 0 agar tidak semuanya terhitung "baru hari ini".
      state.firstSeen[it.id] = state.seeded ? now : 0;
      dirty = true;
    }
    const publish = state.publish[it.id] || null;
    const src = String(it.direct || it.embed || "").trim();
    out.push({
      id: it.id,
      title: String(it.title || ""),
      terms: matchedMinorTerms(it),
      tocilOnly: isTocilOnly(it),
      source: sourceLabel(it),
      category: String(it.category || slugOf(it)),
      status: statusOf(it, publish),
      watchUrl: `/watch/${it.id}`,
      sourceUrl: /^https?:\/\//i.test(src) ? src : null,
      sourcePageUrl: sourcePage(src),
      checkedAt: state.checked[it.id] || null,
      firstSeen: state.firstSeen[it.id] || 0,
      publish,
    });
  }
  if (!state.seeded) {
    state.seeded = true;
    dirty = true;
  }
  if (dirty) await writeReviewState(state).catch(() => false);
  return out;
}

export async function setReviewMark(body: {
  id?: string;
  checked?: boolean;
  publish?: string | null;
}): Promise<{ ok: boolean; error?: string; status?: number }> {
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return { ok: false, error: "bad_id", status: 400 };
  const { byId } = await loadItemsRaw();
  const item = byId.get(id);
  if (!item) return { ok: false, error: "not_found", status: 404 };
  const state = await readReviewState(true);
  if (typeof body.checked === "boolean") {
    if (body.checked) state.checked[id] = Date.now();
    else delete state.checked[id];
  }
  if (body.publish !== undefined) {
    const p = body.publish;
    if (p === "off") state.publish[id] = "off";
    else if (p === "on") {
      if (!isTocilOnly(item)) return { ok: false, error: "publish_not_allowed", status: 403 };
      state.publish[id] = "on";
    } else if (p === null || p === "") delete state.publish[id];
    else return { ok: false, error: "bad_publish", status: 400 };
  }
  const ok = await writeReviewState(state);
  return ok ? { ok: true } : { ok: false, error: "kv_unavailable", status: 503 };
}
