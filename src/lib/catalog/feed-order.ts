/** Urutan feed Terbaru beranda (IndoAV halaman 1, lalu campur by date). */
export function itemDate(item: { createdAt?: string | number; date?: string }): number {
  return Number(item.createdAt || item.date || 0);
}

export function sortByDateDesc<T extends { createdAt?: string | number; date?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => itemDate(b) - itemDate(a));
}

/**
 * Urutan beranda Terbaru:
 * - Slot 1..pageSize: hanya IndoAV terbaru (halaman 1 eksklusif IndoAV)
 * - Sisanya: Userbokep + IndoAV sisa, diurut tanggal saja (tanpa sourcePriority)
 *   agar upload Userbokep baru muncul di halaman 2+, bukan terkubur setelah SEMUA IndoAV.
 */
export function buildMainSorted<T extends { createdAt?: string | number; date?: string }>(
  indoItems: T[],
  userBokepItems: T[],
  pageSize: number,
  fallback: T[] = [],
): T[] {
  const indo = sortByDateDesc(indoItems);
  const ub = sortByDateDesc(userBokepItems);
  if (!indo.length && !ub.length) return sortByDateDesc(fallback);
  const page1 = indo.slice(0, pageSize);
  const rest = sortByDateDesc([...indo.slice(pageSize), ...ub]);
  return [...page1, ...rest];
}
