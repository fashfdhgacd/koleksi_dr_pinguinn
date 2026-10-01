export type R2BucketLike = {
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView | string | ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};

function pick(obj: unknown): R2BucketLike | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const nested = (o.env as Record<string, unknown> | undefined) || {};
  const cand = o.POSTERS || nested.POSTERS;
  if (cand && typeof cand === "object" && typeof (cand as R2BucketLike).get === "function") {
    return cand as R2BucketLike;
  }
  return null;
}

export async function resolvePostersBucket(): Promise<R2BucketLike | null> {
  try {
    const mod = (await import("cloudflare:workers")) as { env?: Record<string, unknown> };
    const hit = pick(mod.env);
    if (hit) return hit;
  } catch {
    /* not workers */
  }
  try {
    const mod = await import("@tanstack/react-start/server");
    const getEvent =
      (mod as { getRequestEvent?: () => unknown }).getRequestEvent ||
      (mod as { getEvent?: () => unknown }).getEvent;
    if (typeof getEvent !== "function") return null;
    const event = getEvent() as {
      context?: Record<string, unknown>;
      nativeEvent?: { context?: Record<string, unknown> };
    } | null;
    if (!event) return null;
    return (
      pick(event.context?.cloudflare) ||
      pick(event.context?.env) ||
      pick(event.context) ||
      pick(event.nativeEvent?.context?.cloudflare) ||
      pick(event.nativeEvent?.context?.env) ||
      null
    );
  } catch {
    return null;
  }
}

export function posterKey(id: string): string {
  return `posters/${id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)}`;
}
