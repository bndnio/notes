import { decrypt } from "./crypto";
import type { Env } from "./types";

export async function resolveNotionToken(userId: string, env: Env): Promise<string> {
  const [encrypted, encryptionKey] = await Promise.all([
    env.NOTION_TOKEN_KV.get(userId),
    env.ENCRYPTION_KEY.get(),
  ]);
  if (!encrypted) throw new Error(`No Notion token found for userId: ${userId}`);
  return decrypt(encrypted, encryptionKey);
}
