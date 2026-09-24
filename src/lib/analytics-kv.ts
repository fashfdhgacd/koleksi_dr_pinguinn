/** Cloudflare KV via binding (preferred) atau REST API (fallback). */

export type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
};

function envStr(name: string): string {
  try {
    return String(process.env[name] || "").trim();
  } catch {
    return "";
  }
}

function pickKv(obj: unknown): KVNamespaceLike | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const cand =
    o.ANALYTICS_KV ||
    o["dr-pinguin-analytics"] ||
    (o.env as Record<string, unknown> | undefined)?.ANALYTICS_KV;
  if (cand && typeof cand === "object" && typeof (cand as KVNamespaceLike).get === "function") {
    return cand as KVNamespaceLike;
  }
  return null;
}

class CfKvRest implements KVNamespaceLike {
  constructor(
    private accountId: string,
    private namespaceId: string,
    private token: string,
  ) {}

  private url(suffix: string, query = ""): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/storage/kv/namespaces/${this.namespaceId}${suffix}${query}`;
  }

  async get(key: string): Promise<string | null> {
    const res = await fetch(this.url(`/values/${encodeURIComponent(key)}`), {
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return res.text();
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const ttl = options?.expirationTtl ? `?expiration_ttl=${options.expirationTtl}` : "";
    await fetch(this.url(`/values/${encodeURIComponent(key)}`, ttl), {
      method: "PUT",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "text/plain;charset=UTF-8",
      },
      body: value,
      signal: AbortSignal.timeout(8000),
    });
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string }) {
    const params = new URLSearchParams();
    if (options?.prefix) params.set("prefix", options.prefix);
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const q = params.toString() ? `?${params}` : "";
    const res = await fetch(this.url("/keys", q), {
      headers: { authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { keys: [], list_complete: true };
    const json = (await res.json()) as {
      result?: { name: string }[];
      result_info?: { cursor?: string };
    };
    const keys = json.result || [];
    const cursor = json.result_info?.cursor;
    return { keys, list_complete: !cursor, cursor };
  }
}

async function fromCloudflareWorkersModule(): Promise<KVNamespaceLike | null> {
  try {
    const mod = (await import("cloudflare:workers")) as {
      env?: Record<string, unknown>;
    };
    return pickKv(mod.env);
  } catch {
    return null;
  }
}

async function fromRequestEvent(): Promise<KVNamespaceLike | null> {
  try {
    // TanStack Start / Vinxi request context (when available)
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
    const ctx = event.context || {};
    const native = event.nativeEvent?.context || {};
    return (
      pickKv(ctx.cloudflare) ||
      pickKv((ctx.cloudflare as { env?: unknown })?.env) ||
      pickKv(ctx.env) ||
      pickKv(ctx) ||
      pickKv(native.cloudflare) ||
      pickKv((native.cloudflare as { env?: unknown })?.env) ||
      pickKv(native.env)
    );
  } catch {
    return null;
  }
}

function fromGlobal(): KVNamespaceLike | null {
  const g = globalThis as unknown as Record<string, unknown>;
  return (
    pickKv(g) ||
    pickKv(g.env) ||
    pickKv(g.__env__) ||
    pickKv((g as { process?: { env?: unknown } }).process?.env)
  );
}

function fromRest(): { kv: KVNamespaceLike; storage: "kv-rest" } | null {
  const account = envStr("CF_ACCOUNT_ID") || envStr("CLOUDFLARE_ACCOUNT_ID");
  const ns =
    envStr("CF_KV_NAMESPACE_ID") ||
    envStr("CF_ANALYTICS_KV_ID") ||
    envStr("ANALYTICS_KV_ID");
  const token = envStr("CF_API_TOKEN") || envStr("CLOUDFLARE_API_TOKEN");
  if (account && ns && token) {
    return { kv: new CfKvRest(account, ns, token), storage: "kv-rest" };
  }
  return null;
}

export async function resolveAnalyticsKV(): Promise<{
  kv: KVNamespaceLike;
  storage: "kv" | "kv-rest";
} | null> {
  const bound =
    (await fromCloudflareWorkersModule()) ||
    (await fromRequestEvent()) ||
    fromGlobal();
  if (bound) return { kv: bound, storage: "kv" };

  const rest = fromRest();
  if (rest) return rest;

  return null;
}
