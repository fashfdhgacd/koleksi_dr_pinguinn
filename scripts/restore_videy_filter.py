#!/usr/bin/env python3
"""Restore local.ts + watch from GOOD sha and apply Videy filters."""
from pathlib import Path
import subprocess

GOOD = "039704e41836b2d8648b9062f378bc95945fc832"

def git_show(path: str) -> str:
    return subprocess.check_output(["git", "show", f"{GOOD}:{path}"], text=True)

def patch_local(s: str) -> str:
    old_thumb = """function thumbOf(item: RawItem, posters: Record<string, string>): string {
  const id = item.id;
  if (isVidey(item)) {
    const videy = videyFile(item);
    if (videy) return videy;
  }
  const fromPoster ="""
    new_thumb = """function thumbOf(item: RawItem, posters: Record<string, string>): string {
  const id = item.id;
  // Videy removed from UI: never feed cdn.videy.co MP4 into thumbs/grids.
  if (isVidey(item)) return "";
  const fromPoster ="""
    if old_thumb not in s:
        raise SystemExit("thumbOf block missing")
    s = s.replace(old_thumb, new_thumb, 1)

    old_cat = """  else if (s === "videy") {
    const hit = bySlug.get("videy");
    pool = hit && hit.length ? hit : items.filter(isVidey);
  }
  else pool = bySlug.get(s) || mainSorted.filter((x) => slugOf(x) === s);
  return pageOf(pool, page, limit, posters, videyNo);
}"""
    new_cat = """  else if (s === "videy") {
    // Videy category hidden — empty listing.
    return pageOf([], page, limit, posters, videyNo);
  }
  else pool = bySlug.get(s) || mainSorted.filter((x) => slugOf(x) === s);
  pool = pool.filter((x) => !isVidey(x));
  return pageOf(pool, page, limit, posters, videyNo);
}"""
    if old_cat not in s:
        raise SystemExit("listCategory block missing")
    s = s.replace(old_cat, new_cat, 1)

    old_search = """  for (const row of haystack) {
    if (tokens.every((t) => row.hay.includes(t))) matched.push(row.item);
  }
  return pageOf(sortByNewest(matched), page, limit, posters, videyNo);
}"""
    new_search = """  for (const row of haystack) {
    if (isVidey(row.item)) continue;
    if (tokens.every((t) => row.hay.includes(t))) matched.push(row.item);
  }
  return pageOf(sortByNewest(matched), page, limit, posters, videyNo);
}"""
    if old_search not in s:
        raise SystemExit("listSearch block missing")
    s = s.replace(old_search, new_search, 1)

    old_detail = """  if (!item) {
    throw Object.assign(new Error("Video tidak ditemukan"), { code: "not_found" as const });
  }"""
    new_detail = """  if (!item || isVidey(item)) {
    throw Object.assign(new Error("Video tidak ditemukan"), { code: "not_found" as const });
  }"""
    if old_detail not in s:
        raise SystemExit("getDetail block missing")
    s = s.replace(old_detail, new_detail, 1)

    old_rel = """  const current = items.find((x) => x.id === id) || null;
  const seed = slotIndex(hashId(id) % 997);
  let pool: RawItem[];

  if (current && isVidey(current)) {
    // Videy: wajib ~½ rekomendasi dari IndoAV
    const half = Math.max(1, Math.ceil(limit / 2));
    const indo = mixIndoHeavy(items, id, half, seed);
    const videy = shuffleSlot(
      items.filter((x) => isVidey(x) && x.id !== id),
      seed + 101,
    ).slice(0, Math.max(0, limit - indo.length));
    pool = shuffleSlot([...indo, ...videy], seed + 131).slice(0, limit);
  } else {
    // Non-Videy: IndoAV-heavy random per 5 menit (bukan se-kategori Lainnya yang nempel)
    pool = mixIndoHeavy(items, id, limit, seed);
  }"""
    new_rel = """  const seed = slotIndex(hashId(id) % 997);

  // Videy filtered from all related/\"Tonton juga\" grids.
  const pool = mixIndoHeavy(items, id, limit, seed).filter((x) => !isVidey(x));"""
    if old_rel not in s:
        raise SystemExit("listRelated block missing")
    s = s.replace(old_rel, new_rel, 1)

    old_cats = """  for (const [slug, list] of bySlug) {
    const cat = findCategory(slug);
    out.push({ slug, label: cat?.label || slug, count: list.length });
  }"""
    new_cats = """  for (const [slug, list] of bySlug) {
    if (slug === \"videy\") continue; // hide Videy category chip/nav
    const nonVidey = list.filter((x) => !isVidey(x));
    if (!nonVidey.length) continue;
    const cat = findCategory(slug);
    out.push({ slug, label: cat?.label || slug, count: nonVidey.length });
  }"""
    if old_cats not in s:
        raise SystemExit("listCategories block missing")
    s = s.replace(old_cats, new_cats, 1)

    old_use = """function isUsable(item: RawItem): boolean {
  if (!item?.id || typeof item.id !== \"string\") return false;
"""
    new_use = """function isUsable(item: RawItem): boolean {
  if (isVidey(item)) return false; // cabut Videy dari index/feed
  if (!item?.id || typeof item.id !== \"string\") return false;
"""
    if old_use not in s:
        raise SystemExit("isUsable block missing")
    s = s.replace(old_use, new_use, 1)

    if "PLACEHOLDER_WILL_REPLACE" in s:
        raise SystemExit("placeholder leaked")
    if len(s.splitlines()) < 500:
        raise SystemExit("local too short")
    return s

def patch_watch(s: str) -> str:
    if "eagerCount={12}" not in s:
        raise SystemExit("eagerCount=12 missing")
    s = s.replace("eagerCount={12}", "eagerCount={0}", 1)
    old = """  if (/videy/.test(raw)) return { q: undefined, category: \"videy\" };"""
    new = """  // Videy category hidden — fall through to home (no category).
  if (/videy/.test(raw)) return { q: undefined, category: undefined };"""
    if old not in s:
        raise SystemExit("catalogSearchFromItem videy branch missing")
    s = s.replace(old, new, 1)
    if "component: () => null" in s or "PLACEHOLDER_WILL_REPLACE" in s:
        raise SystemExit("watch stub")
    if len(s.splitlines()) < 400:
        raise SystemExit("watch too short")
    return s

def main() -> None:
    local = patch_local(git_show("src/lib/catalog/local.ts"))
    watch = patch_watch(git_show("src/routes/watch.$id.tsx"))
    Path("src/lib/catalog/local.ts").write_text(local)
    Path("src/routes/watch.$id.tsx").write_text(watch)
    print("local_lines", local.count(chr(10)) + 1, "watch_lines", watch.count(chr(10)) + 1)
    print("OK")

if __name__ == "__main__":
    main()
