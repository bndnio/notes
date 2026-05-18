import { decrypt } from "./crypto";
import type { Env, NotionSecrets } from "./types";

async function loadNotionSecretsPayload(userId: string, env: Env): Promise<NotionSecrets | string | null> {
  const [encrypted, encryptionKey] = await Promise.all([
    env.NOTION_TOKEN_KV.get(userId),
    env.ENCRYPTION_KEY.get(),
  ]);
  if (!encrypted) return null;
  const decrypted = await decrypt(encrypted, encryptionKey);
  try {
    return JSON.parse(decrypted) as NotionSecrets;
  } catch {
    return decrypted;
  }
}

// TODO: Remove the backwards compatibility with string return type once legacy users have been migrated
export async function resolveNotionToken(userId: string, env: Env): Promise<string | null> {
  const payload = await loadNotionSecretsPayload(userId, env);
  if (!payload) return null;
  return typeof payload === "string" ? payload : payload.accessToken ?? null;
}

export async function resolveNotionSecrets(userId: string, env: Env): Promise<NotionSecrets | null> {
  const payload = await loadNotionSecretsPayload(userId, env);
  if (!payload || typeof payload === "string") return null;
  return payload;
}
