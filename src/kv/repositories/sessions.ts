// session:<hmac-sha256(sessionToken)> → userId

export const SESSION_TTL = 604800; // 7 days

const key = (sessionHash: string) => `session:${sessionHash}`;

export async function create(kv: KVNamespace, sessionHash: string, userId: string): Promise<void> {
  await kv.put(key(sessionHash), userId, { expirationTtl: SESSION_TTL });
}

export function findUserId(kv: KVNamespace, sessionHash: string): Promise<string | null> {
  return kv.get(key(sessionHash));
}

export async function remove(kv: KVNamespace, sessionHash: string): Promise<void> {
  await kv.delete(key(sessionHash));
}
