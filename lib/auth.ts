import { hmacToken } from "./crypto";
import { getCookie } from "./cookies";
import { lookupProfile } from "./profiles";
import type { Env, Profile } from "./types";

export function sessionCookieHeader(token: string): string {
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/`;
}

export async function resolveProfile(token: string, env: Env): Promise<Profile | null> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const hash = await hmacToken(token, encryptionKey);
  const userId = await env.MCP_TOKEN_KV.get(hash);
  if (!userId) return null;
  return lookupProfile(env.PROFILE_KV, userId);
}

export async function resolveSession(request: Request, env: Env, encryptionKey: string): Promise<string | null> {
  const sessionToken = getCookie(request, "session");
  if (!sessionToken) return null;
  const sessionHash = await hmacToken(sessionToken, encryptionKey);
  return env.EPHEMERAL_KV.get(`session:${sessionHash}`);
}
