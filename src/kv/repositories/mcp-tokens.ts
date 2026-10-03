// mcp_token:<userId> → JSON {name, encrypted}, pending until Done
//   name      — label the token will be saved under
//   encrypted — AES-GCM encrypted MCP token (base64)

import { ephemeralKv } from "../namespace";

const TTL = 3600; // 1 hour

const key = (userId: string) => `mcp_token:${userId}`;

export interface PendingMcpToken {
  name: string;
  encrypted: string;
}

export async function put(userId: string, pending: PendingMcpToken): Promise<void> {
  await ephemeralKv().put(key(userId), JSON.stringify(pending), { expirationTtl: TTL });
}

export async function find(userId: string): Promise<PendingMcpToken | null> {
  const raw = await ephemeralKv().get(key(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // A value that isn't JSON has no name to save under, so it can't be committed. Treat it as absent; the TTL clears it.
    console.warn(`Ignoring unparseable pending MCP token for user ${userId}`);
    return null;
  }
}

export async function remove(userId: string): Promise<void> {
  await ephemeralKv().delete(key(userId));
}
