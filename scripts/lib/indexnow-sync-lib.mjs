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
