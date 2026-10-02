// notion_state:<randomHex32>     → userId, binds an OAuth callback to the session that started it
// notion_token:<userId>         → AES-GCM encrypted OAuth token, pending database selection
// notion_dbs:<userId>           → JSON Array<{id, title}>
// notion_schema_error:<userId> → schema validation message shown on the picker

import type { NotionDatabase } from "@/lib/notion-client";
import { ephemeralKv } from "../namespace";

const STATE_TTL = 900; // 15 minutes
const PENDING_TTL = 3600; // 1 hour

const stateKey = (state: string) => `notion_state:${state}`;
const tokenKey = (userId: string) => `notion_token:${userId}`;
const databasesKey = (userId: string) => `notion_dbs:${userId}`;
const schemaErrorKey = (userId: string) => `notion_schema_error:${userId}`;

export async function putState(state: string, userId: string): Promise<void> {
  await ephemeralKv().put(stateKey(state), userId, { expirationTtl: STATE_TTL });
}

export function findStateUserId(state: string): Promise<string | null> {
  return ephemeralKv().get(stateKey(state));
}

export async function removeState(state: string): Promise<void> {
  await ephemeralKv().delete(stateKey(state));
}

export async function putToken(userId: string, encrypted: string): Promise<void> {
  await ephemeralKv().put(tokenKey(userId), encrypted, { expirationTtl: PENDING_TTL });
}

export function findToken(userId: string): Promise<string | null> {
  return ephemeralKv().get(tokenKey(userId));
}

export async function removeToken(userId: string): Promise<void> {
  await ephemeralKv().delete(tokenKey(userId));
}

export async function putDatabases(userId: string, databases: NotionDatabase[]): Promise<void> {
  await ephemeralKv().put(databasesKey(userId), JSON.stringify(databases), { expirationTtl: PENDING_TTL });
}

export async function findDatabases(userId: string): Promise<NotionDatabase[] | null> {
  const raw = await ephemeralKv().get(databasesKey(userId));
  return raw ? (JSON.parse(raw) as NotionDatabase[]) : null;
}

export async function removeDatabases(userId: string): Promise<void> {
  await ephemeralKv().delete(databasesKey(userId));
}

export async function putSchemaError(userId: string, message: string): Promise<void> {
  await ephemeralKv().put(schemaErrorKey(userId), message, { expirationTtl: PENDING_TTL });
}

export function findSchemaError(userId: string): Promise<string | null> {
  return ephemeralKv().get(schemaErrorKey(userId));
}

export async function removeSchemaError(userId: string): Promise<void> {
  await ephemeralKv().delete(schemaErrorKey(userId));
}
