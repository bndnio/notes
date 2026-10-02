// email_add:<userId> → pending email address awaiting PIN verification.
// TTL matches the PIN so the pointer and the PIN it points at expire together.

import { PIN_TTL } from "./pins";

const key = (userId: string) => `email_add:${userId}`;

export async function put(kv: KVNamespace, userId: string, email: string): Promise<void> {
  await kv.put(key(userId), email, { expirationTtl: PIN_TTL });
}

export function find(kv: KVNamespace, userId: string): Promise<string | null> {
  return kv.get(key(userId));
}

export async function remove(kv: KVNamespace, userId: string): Promise<void> {
  await kv.delete(key(userId));
}
