// mcp_token:<userId> → AES-GCM encrypted MCP token (base64), pending until Done

import { ephemeralKv } from "../namespace";

const TTL = 3600; // 1 hour

const key = (userId: string) => `mcp_token:${userId}`;

export async function put(userId: string, encrypted: string): Promise<void> {
  await ephemeralKv().put(key(userId), encrypted, { expirationTtl: TTL });
}

export function find(userId: string): Promise<string | null> {
  return ephemeralKv().get(key(userId));
}

export async function remove(userId: string): Promise<void> {
  await ephemeralKv().delete(key(userId));
}
