import { hmacToken } from "./crypto";
import { lookupProfile } from "./profiles";
import type { Env, Profile } from "./types";

export async function resolveProfile(token: string, env: Env): Promise<Profile | null> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const hash = await hmacToken(token, encryptionKey);
  const userId = await env.MCP_TOKEN_KV.get(hash);
  if (!userId) return null;
  return lookupProfile(env.PROFILE_KV, userId);
}
