// session:<hmac-sha256(sessionToken)> → userId

import { ephemeralKv } from "../namespace";

export const SESSION_TTL = 604800; // 7 days

const key = (sessionHash: string) => `session:${sessionHash}`;

export async function create(sessionHash: string, userId: string): Promise<void> {
  await ephemeralKv().put(key(sessionHash), userId, { expirationTtl: SESSION_TTL });
}

export function findUserId(sessionHash: string): Promise<string | null> {
  return ephemeralKv().get(key(sessionHash));
}

export async function remove(sessionHash: string): Promise<void> {
  await ephemeralKv().delete(key(sessionHash));
}
