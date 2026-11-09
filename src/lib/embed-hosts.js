/**
 * Allowlist domain untuk embed generik (record host "embed" dari parse.js).
 * Link dari domain yang belum disetujui ditahan sebagai hidden_reason
 * "embed-review" dan muncul di /pemilik → Perlu dicek; begitu owner menayangkan
 * satu item dari domain itu, domainnya masuk daftar ini dan link berikutnya
 * dari domain sama tayang langsung tanpa review ulang.
 * Disimpan di KV (ANALYTICS_KV) — tidak ada layanan/biaya baru.
 */
import { resolveAnalyticsKV } from "@/lib/analytics-kv";

const KEY = "embed:allowed-hosts:v1";

/** hostname lowercase tanpa www.; "" untuk URL rusak / bukan http(s). */
export function embedDomainOf(url) {
  try {
    const u = new URL(String(url || "").trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function readList() {
  try {
    const kv = (await resolveAnalyticsKV())?.kv;
    if (!kv) return [];
    const raw = await kv.get(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((d) => typeof d === "string") : [];
  } catch {
    return [];
  }
}

/** Set domain yang sudah disetujui owner ("" entries never match). */
export async function readEmbedHosts() {
  return new Set(await readList());
}

/**
 * Tambahkan domain ke allowlist. Idempotent; aman dipanggil berulang.
 * Panggil SETELAH keputusan owner — kegagalan KV tidak boleh menggagalkan approval.
 */
export async function allowEmbedHosts(domains) {
  const add = [
    ...new Set(
      (Array.isArray(domains) ? domains : [domains])
        .map((d) => String(d || "").toLowerCase().trim())
        .filter(Boolean),
    ),
  ];
  if (!add.length) return;
  try {
    const kv = (await resolveAnalyticsKV())?.kv;
    if (!kv) return;
    const next = [...new Set([...(await readList()), ...add])].sort();
    await kv.put(KEY, JSON.stringify(next));
  } catch {
    /* KV opsional — approval owner tetap sukses */
  }
}
