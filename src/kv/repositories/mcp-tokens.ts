// mcp_token:<userId> → AES-GCM encrypted MCP token (base64), pending until Done

const TTL = 3600; // 1 hour

const key = (userId: string) => `mcp_token:${userId}`;

export async function put(kv: KVNamespace, userId: string, encrypted: string): Promise<void> {
  await kv.put(key(userId), encrypted, { expirationTtl: TTL });
}

export function find(kv: KVNamespace, userId: string): Promise<string | null> {
  return kv.get(key(userId));
}

export async function remove(kv: KVNamespace, userId: string): Promise<void> {
  await kv.delete(key(userId));
}
