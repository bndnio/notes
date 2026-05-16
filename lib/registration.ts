import { encrypt, hmacToken } from "./crypto";
import type { Env } from "./types";

async function validateNotionAccess(notionDbId: string, notionToken: string): Promise<boolean> {
  const res = await fetch(`https://api.notion.com/v1/databases/${notionDbId}`, {
    headers: { Authorization: `Bearer ${notionToken}`, "Notion-Version": "2022-06-28" },
  });
  return res.ok;
}

async function generateUniqueUserId(profileKv: KVNamespace): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const id = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    if (!(await profileKv.get(id))) return id;
  }
  throw new Error("Failed to generate unique userId after 5 attempts");
}

export async function register(
  env: Env,
  input: { email: string; username: string; notionDbId: string; notionToken: string },
): Promise<{ error: string } | { mcpToken: string }> {
  const { email, username, notionDbId, notionToken } = input;

  const notionOk = await validateNotionAccess(notionDbId, notionToken);
  if (!notionOk) return { error: "Could not access Notion database. Check your Database ID and token." };

  if (await env.USER_INDEX_KV.get(email)) return { error: "Email already registered." };
  if (await env.USER_INDEX_KV.get(username)) return { error: "Username already taken." };

  const userId = await generateUniqueUserId(env.PROFILE_KV);
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const encryptedToken = await encrypt(notionToken, encryptionKey);

  await Promise.all([
    env.USER_INDEX_KV.put(email, userId),
    env.USER_INDEX_KV.put(username, userId),
    env.PROFILE_KV.put(userId, JSON.stringify({ userId, username, notionDbId })),
    env.NOTION_TOKEN_KV.put(userId, encryptedToken),
  ]);

  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const mcpToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const mcpTokenHash = await hmacToken(mcpToken, encryptionKey);
  await env.MCP_TOKEN_KV.put(mcpTokenHash, userId);

  return { mcpToken };
}
