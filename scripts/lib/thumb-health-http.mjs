/** @param {Response} response */
export function isCloudflareChallenge(response) {
  return response.headers.get("cf-mitigated")?.trim().toLowerCase() === "challenge";
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T) => Promise<void>} fn
 * @param {() => boolean} shouldStop
 */
export async function poolUntil(items, concurrency, fn, shouldStop) {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < items.length && !shouldStop()) await fn(items[next++]);
    }),
  );
}

/**
 * @param {{
 *   id: string,
 *   site: string,
 *   day: string,
 *   headers: Record<string, string>,
 *   verify: () => Promise<string>,
 *   fetchImpl?: typeof fetch
 * }} options
 * @returns {Promise<{ state: "repaired" | "unresolved" | "error" | "challenge", reason: string }>}
 */
export async function attemptThumbRepair({ id, site, day, headers, verify, fetchImpl = fetch }) {
  try {
    const url = `${site}/thumb/${encodeURIComponent(id)}?h=${encodeURIComponent(day)}`;
    const response = await fetchImpl(url, {
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(25000),
    });
    const contentType = response.headers.get("content-type") || "";
    const fallback = response.status === 302 && response.headers.get("x-thumb-fallback") === "1";
    if (isCloudflareChallenge(response)) {
      return { state: "challenge", reason: `Cloudflare challenge (HTTP ${response.status})` };
    }
    await response.body?.cancel();
    if (fallback) return { state: "unresolved", reason: "site returned its fallback poster" };
    if (response.status !== 200) return { state: "error", reason: `HTTP ${response.status}` };
    if (!/^image\//i.test(contentType)) return { state: "error", reason: "HTTP 200 without an image" };

    const verdict = await verify();
    if (verdict === "ok") return { state: "repaired", reason: "" };
    if (["absent", "placeholder", "small", "blank", "notimage"].includes(verdict)) {
      return { state: "unresolved", reason: `R2 verification: ${verdict}` };
    }
    return { state: "error", reason: `R2 verification: ${verdict}` };
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return { state: "error", reason: `exception ${detail.slice(0, 160)}` };
  }
}
