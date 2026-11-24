// Bot calendar dates are stored at day precision. Keep the existing UTC day boundary.
export function publicationDate(raw, now = Date.now()) {
  const value = typeof raw === "string" ? raw.trim() : raw;
  let ms;
  if (typeof value === "number" || (typeof value === "string" && /^\d{10,13}$/.test(value))) {
    const n = Number(value);
    ms = n < 1e12 ? n * 1000 : n;
  } else if (typeof value === "string") {
    const iso = /^(\d{4}-\d\d-\d\d)(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d))?$/i.exec(value);
    if (!iso) return undefined;
    const day = Date.parse(iso[1]);
    if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== iso[1]) return undefined;
    ms = Date.parse(value);
  } else return undefined;
  if (!Number.isFinite(ms) || ms <= 0 || ms > now) return undefined;
  return new Date(ms).toISOString().replace(/\.000Z$/, "Z");
}
