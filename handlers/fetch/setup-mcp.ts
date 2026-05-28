import { getCookie } from "../../lib/cookies";
import { hmacToken, generateRandomHex, encrypt } from "../../lib/crypto";
import { lookupProfile } from "../../lib/profiles";
import type { Env } from "../../lib/types";

async function resolveSession(request: Request, env: Env, encryptionKey: string): Promise<string | null> {
  const sessionToken = getCookie(request, "session");
  if (!sessionToken) return null;
  const sessionHash = await hmacToken(sessionToken, encryptionKey);
  return env.EPHEMERAL_KV.get(`session:${sessionHash}`);
}

export async function handleGenerateMcpToken(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const userId = await resolveSession(request, env, encryptionKey);
  if (!userId) return Response.redirect(`${env.APP_URL}/login`, 302);

  const profile = await lookupProfile(env.PROFILE_KV, userId);
  if (!profile) return Response.redirect(`${env.APP_URL}/login`, 302);

  const form = await request.formData();
  const isRegenerate = form.get("regenerate") === "1";

  const existingEncrypted = await env.EPHEMERAL_KV.get(`mcp_token:${userId}`);
  if (existingEncrypted && !isRegenerate) {
    return Response.redirect(`${env.APP_URL}/profile?modal=mcp-setup`, 302);
  }

  const mcpToken = generateRandomHex(32);
  const mcpTokenHash = await hmacToken(mcpToken, encryptionKey);
  const encrypted = await encrypt(mcpToken, encryptionKey);

  const writes: Promise<unknown>[] = [
    env.MCP_TOKEN_KV.put(mcpTokenHash, userId),
    env.EPHEMERAL_KV.put(`mcp_token:${userId}`, encrypted, { expirationTtl: 3600 }),
    env.PROFILE_KV.put(userId, JSON.stringify({ ...profile, mcpTokenHash })),
  ];

  if (isRegenerate && profile.mcpTokenHash) {
    writes.push(env.MCP_TOKEN_KV.delete(profile.mcpTokenHash));
  }

  await Promise.all(writes);
  return Response.redirect(`${env.APP_URL}/profile?modal=mcp-setup`, 302);
}

export async function handleMcpDone(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const userId = await resolveSession(request, env, encryptionKey);
  if (!userId) return Response.redirect(`${env.APP_URL}/login`, 302);

  await env.EPHEMERAL_KV.delete(`mcp_token:${userId}`);
  return Response.redirect(`${env.APP_URL}/profile?toast=MCP+server+configured`, 302);
}
