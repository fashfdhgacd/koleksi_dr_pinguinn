import { createFileRoute } from "@tanstack/react-router";
import { queryCatalog } from "@/lib/catalog/service";

function statusFor(code: string | undefined, ok: boolean): number {
  if (ok) return 200;
  if (code === "bad_request") return 400;
  if (code === "not_found") return 404;
  return 502;
}

function cacheControl(ok: boolean, type: string | null): string {
  if (!ok) return "private, no-store";
  if (type === "search") {
    return "public, max-age=30, s-maxage=60, stale-while-revalidate=300";
  }
  if (type === "detail" || type === "related") {
    return "public, max-age=120, s-maxage=600, stale-while-revalidate=86400";
  }
  if (type === "categories") {
    return "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
  }
  // home / latest / featured / category — browser 2 menit, edge 10 menit
  return "public, max-age=120, s-maxage=600, stale-while-revalidate=3600";
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const result = await queryCatalog({
    type,
    page: url.searchParams.get("page"),
    limit: url.searchParams.get("limit"),
    category: url.searchParams.get("category"),
    q: url.searchParams.get("q"),
    id: url.searchParams.get("id"),
  });
  const ok = result.ok;
  const code = ok ? undefined : result.code;
  return Response.json(result, {
    status: statusFor(code, ok),
    headers: {
      "cache-control": cacheControl(ok, type),
    },
  });
}

export const Route = createFileRoute("/api/data")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
    },
  },
});
