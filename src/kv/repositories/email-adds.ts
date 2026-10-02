// email_add:<userId> → pending email address awaiting PIN verification.
// TTL matches the PIN so the pointer and the PIN it points at expire together.

import { ephemeralKv } from "../namespace";
import { PIN_TTL } from "./pins";

const key = (userId: string) => `email_add:${userId}`;

export async function put(userId: string, email: string): Promise<void> {
  await ephemeralKv().put(key(userId), email, { expirationTtl: PIN_TTL });
}

export function find(userId: string): Promise<string | null> {
  return ephemeralKv().get(key(userId));
}

export async function remove(userId: string): Promise<void> {
  await ephemeralKv().delete(key(userId));
}
