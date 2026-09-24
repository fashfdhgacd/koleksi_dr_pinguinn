/** Cloudflare KV via binding atau REST API. */

export type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
};

function env(name: string): string {
  try {
    return String(process.env[name] || "").trim();
  } catch {
    return "";
  }
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

export async function resolveAnalyticsKV(): Promise<{
  kv: KVNamespaceLike;
  storage: "kv" | "kv-rest";
} | null> {
  try {
    const mod = (await import("cloudflare:workers")) as {
      env?: Record<string, KVNamespaceLike | undefined>;
    };
    if (mod.env?.ANALYTICS_KV) return { kv: mod.env.ANALYTICS_KV, storage: "kv" };
  } catch {
    /* not CF module */
  }
  const g = globalThis as unknown as {
    ANALYTICS_KV?: KVNamespaceLike;
    env?: Record<string, KVNamespaceLike | undefined>;
  };
  if (g.ANALYTICS_KV) return { kv: g.ANALYTICS_KV, storage: "kv" };
  if (g.env?.ANALYTICS_KV) return { kv: g.env.ANALYTICS_KV, storage: "kv" };

  const account = env("CF_ACCOUNT_ID") || env("CLOUDFLARE_ACCOUNT_ID");
  const ns = env("CF_KV_NAMESPACE_ID") || env("CF_ANALYTICS_KV_ID") || env("ANALYTICS_KV_ID");
  const token = env("CF_API_TOKEN") || env("CLOUDFLARE_API_TOKEN");
  if (account && ns && token) {
    return { kv: new CfKvRest(account, ns, token), storage: "kv-rest" };
  }
  return null;
}
