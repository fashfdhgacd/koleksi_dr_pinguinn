/** Cover JAV dari kode di judul. Jangan dipakai kategori lain. */
export function javCoverFromTitle(title = ""): string {
  const m = String(title).match(/\b([A-Z]{2,8})[-_ ]?(\d{3,5})\b/i);
  if (!m) return "";
  const code = `${m[1].toLowerCase()}${String(Number(m[2])).padStart(5, "0")}`;
  return `https://pics.dmm.co.jp/digital/video/${code}/${code}pl.jpg`;
}

export function isNowPrintingUrl(url: string): boolean {
  return /now[_-]?printing|placeholder|1x1|transparent/i.test(url);
}
