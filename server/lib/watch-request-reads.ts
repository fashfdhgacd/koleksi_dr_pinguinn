// Nitro middleware and the SSR router are bundled separately but handle the same request.
import { AsyncLocalStorage } from "node:async_hooks";

type Reads = Map<string, Promise<unknown>>;
const host = globalThis as typeof globalThis & { __kdpWatchReads?: AsyncLocalStorage<Reads> };
const scope = host.__kdpWatchReads ??= new AsyncLocalStorage<Reads>();

export function withWatchRequestReads<T>(fn: () => T): T {
  return scope.run(new Map(), fn);
}

export function readWatchListsOnce<T>(read: () => Promise<T>): Promise<T> {
  const reads = scope.getStore();
  if (!reads) return read();
  const prior = reads.get("catalog-lists");
  if (prior) return prior as Promise<T>;
  const pending = read();
  reads.set("catalog-lists", pending);
  return pending;
}
