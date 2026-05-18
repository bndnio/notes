import { decrypt } from "./crypto";
import type { Env } from "./types";

export async function resolveNotionToken(userId: string, env: Env): Promise<string | null> {
  const [encrypted, encryptionKey] = await Promise.all([
    env.NOTION_TOKEN_KV.get(userId),
    env.ENCRYPTION_KEY.get(),
  ]);
  if (!encrypted) return null;
  return decrypt(encrypted, encryptionKey);
}
