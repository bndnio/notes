// notion_state:<randomHex32>     → userId, binds an OAuth callback to the session that started it
// notion_token:<userId>         → AES-GCM encrypted OAuth token, pending database selection
// notion_dbs:<userId>           → JSON Array<{id, title}>
// notion_schema_error:<userId> → schema validation message shown on the picker

import type { NotionDatabase } from "@/lib/notion-client";

const STATE_TTL = 900; // 15 minutes
const PENDING_TTL = 3600; // 1 hour

const stateKey = (state: string) => `notion_state:${state}`;
const tokenKey = (userId: string) => `notion_token:${userId}`;
const databasesKey = (userId: string) => `notion_dbs:${userId}`;
const schemaErrorKey = (userId: string) => `notion_schema_error:${userId}`;

export async function putState(kv: KVNamespace, state: string, userId: string): Promise<void> {
  await kv.put(stateKey(state), userId, { expirationTtl: STATE_TTL });
}

export function findStateUserId(kv: KVNamespace, state: string): Promise<string | null> {
  return kv.get(stateKey(state));
}

export async function removeState(kv: KVNamespace, state: string): Promise<void> {
  await kv.delete(stateKey(state));
}

export async function putToken(kv: KVNamespace, userId: string, encrypted: string): Promise<void> {
  await kv.put(tokenKey(userId), encrypted, { expirationTtl: PENDING_TTL });
}

export function findToken(kv: KVNamespace, userId: string): Promise<string | null> {
  return kv.get(tokenKey(userId));
}

export async function removeToken(kv: KVNamespace, userId: string): Promise<void> {
  await kv.delete(tokenKey(userId));
}

export async function putDatabases(
  kv: KVNamespace,
  userId: string,
  databases: NotionDatabase[],
): Promise<void> {
  await kv.put(databasesKey(userId), JSON.stringify(databases), { expirationTtl: PENDING_TTL });
}

export async function findDatabases(kv: KVNamespace, userId: string): Promise<NotionDatabase[] | null> {
  const raw = await kv.get(databasesKey(userId));
  return raw ? (JSON.parse(raw) as NotionDatabase[]) : null;
}

export async function removeDatabases(kv: KVNamespace, userId: string): Promise<void> {
  await kv.delete(databasesKey(userId));
}

export async function putSchemaError(kv: KVNamespace, userId: string, message: string): Promise<void> {
  await kv.put(schemaErrorKey(userId), message, { expirationTtl: PENDING_TTL });
}

export function findSchemaError(kv: KVNamespace, userId: string): Promise<string | null> {
  return kv.get(schemaErrorKey(userId));
}

export async function removeSchemaError(kv: KVNamespace, userId: string): Promise<void> {
  await kv.delete(schemaErrorKey(userId));
}
