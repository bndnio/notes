import { decrypt } from "./crypto";
import type { Env } from "./types";

export async function resolveNotionToken(username: string, env: Env): Promise<string> {
  const [encrypted, encryptionKey] = await Promise.all([
    env.NOTION_TOKEN_KV.get(username),
    env.ENCRYPTION_KEY.get(),
  ]);
  if (!encrypted) throw new Error(`No Notion token found for username: ${username}`);
  return decrypt(encrypted, encryptionKey);
}
