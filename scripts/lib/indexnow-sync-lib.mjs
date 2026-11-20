/**
 * Plan a bounded IndexNow sync while retaining removed URLs that did not fit this run.
 * The retained entries are tombstones: they stay in state until a later run submits them.
 */
export function parseIndexNowState(contents) {
  const map = new Map();
  for (const rawLine of String(contents || "").split("\n")) {
    const line = rawLine.trim();
    const splitAt = line.lastIndexOf(" ");
    if (splitAt > 0 && line.startsWith("/")) map.set(line.slice(0, splitAt), line.slice(splitAt + 1));
  }
  return map;
}

export function planIndexNowSync(live, previous, { all = false, maxRemoved = 2000 } = {}) {
  const next = new Map(live);
  if (!previous) return { send: all ? [...live.keys()] : [], next };

  const changed = [...live].filter(([path, lastmod]) => previous.get(path) !== lastmod).map(([path]) => path);
  const removed = [...previous].filter(([path]) => !live.has(path));
  const sendRemoved = removed.slice(0, maxRemoved);

  for (const [path, lastmod] of removed.slice(maxRemoved)) next.set(path, lastmod);
  return {
    send: [...(all ? live.keys() : changed), ...sendRemoved.map(([path]) => path)],
    next,
  };
}

/**
 * Submission order: brand-new /watch pages, then other new pages, then changed pages, then
 * removed ones. Stable within each group.
 */
export function prioritizeIndexNow(paths, previous) {
  const rank = (p) => {
    const isNew = !previous || !previous.has(p);
    if (isNew && p.startsWith("/watch/")) return 0;
    if (isNew) return 1;
    return 2;
  };
  return paths.map((p, i) => [p, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([p]) => p);
}

/** Path map for one origin, from `https://host/path lastmod` lines in the shared state file. */
export function parseIndexNowOriginState(contents, origin) {
  const prefix = String(origin || "").replace(/\/$/, "");
  const map = new Map();
  if (!prefix.startsWith("https://")) return map;
  for (const rawLine of String(contents || "").split("\n")) {
    const line = rawLine.trim();
    const splitAt = line.lastIndexOf(" ");
    if (splitAt <= 0) continue;
    const loc = line.slice(0, splitAt);
    if (loc !== prefix && !loc.startsWith(prefix + "/")) continue;
    const path = loc === prefix || loc === prefix + "/" ? "/" : loc.slice(prefix.length);
    if (path.startsWith("/")) map.set(path, line.slice(splitAt + 1));
  }
  return map;
}

/** Format a path map as state lines. Pass origin to write absolute URLs; omit it for `/path` lines. */
export function formatIndexNowState(pathMap, origin = "") {
  const prefix = origin ? String(origin).replace(/\/$/, "") : "";
  return [...pathMap]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([p, m]) => {
      const loc = prefix ? prefix + (p === "/" ? "/" : p) : p;
      return `${loc} ${m}`;
    })
    .join("\n");
}

/**
 * First-run drip: sitemap + home + newest /watch pages, then other paths, capped.
 * The rest stay out of state so later runs submit them.
 */
export function seedIndexNowPaths(live, { max = 500 } = {}) {
  const watches = [...live]
    .filter(([p]) => p.startsWith("/watch/"))
    .sort((a, b) => String(b[1]).localeCompare(String(a[1])) || (a[0] < b[0] ? -1 : 1))
    .map(([p]) => p);
  const others = [...live.keys()]
    .filter((p) => p !== "/" && p !== "/sitemap.xml" && !p.startsWith("/watch/"))
    .sort();
  const ordered = [];
  for (const p of ["/sitemap.xml", "/", ...watches, ...others]) {
    if (p === "/sitemap.xml" || live.has(p)) ordered.push(p);
  }
  return [...new Set(ordered)].slice(0, max);
}
