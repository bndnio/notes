import type { Env } from "@/lib/types";

// The KV binding does not vary per request, so the worker entry sets it once
// instead of passing env into every repository call.
let bound: KVNamespace | undefined;

export function bindEphemeralKv(env: Env): void {
  bound = env.EPHEMERAL_KV;
}

export function ephemeralKv(): KVNamespace {
  if (!bound) throw new Error("EPHEMERAL_KV is not bound");
  return bound;
}
