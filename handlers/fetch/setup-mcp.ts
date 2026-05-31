import { resolveSession } from "../../lib/auth";
import { hmacToken, generateRandomHex, encrypt, decrypt } from "../../lib/crypto";
import { createDb } from "../../lib/db";
import * as usersRepo from "../../lib/db/repositories/users";
import type { Env } from "../../lib/types";

export async function handleGenerateMcpToken(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const userId = await resolveSession(request, env, encryptionKey);
  if (!userId) return Response.redirect(`${env.APP_URL}/login`, 302);

  const db = createDb(env.DB);
  const user = await usersRepo.findById(db, userId);
  if (!user) return Response.redirect(`${env.APP_URL}/login`, 302);

  const form = await request.formData();
  const isRegenerate = form.get("regenerate") === "1";

  const existingPending = await env.EPHEMERAL_KV.get(`mcp_token:${userId}`);
  if (existingPending && !isRegenerate) {
    return Response.redirect(`${env.APP_URL}/profile?modal=mcp-setup`, 302);
  }

  const mcpToken = generateRandomHex(32);
  const encrypted = await encrypt(mcpToken, encryptionKey);

  await env.EPHEMERAL_KV.put(`mcp_token:${userId}`, encrypted, { expirationTtl: 3600 });

  return Response.redirect(`${env.APP_URL}/profile?modal=mcp-setup`, 302);
}

export async function handleMcpDone(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const userId = await resolveSession(request, env, encryptionKey);
  if (!userId) return Response.redirect(`${env.APP_URL}/login`, 302);

  const db = createDb(env.DB);
  const user = await usersRepo.findById(db, userId);
  if (!user) return Response.redirect(`${env.APP_URL}/login`, 302);

  const encrypted = await env.EPHEMERAL_KV.get(`mcp_token:${userId}`);
  if (encrypted) {
    const mcpToken = await decrypt(encrypted, encryptionKey);
    const hash = await hmacToken(mcpToken, encryptionKey);
    await Promise.all([
      usersRepo.updateMcpTokenHash(db, userId, hash),
      env.EPHEMERAL_KV.delete(`mcp_token:${userId}`),
    ]);
  }

  return Response.redirect(`${env.APP_URL}/profile?toast=MCP+server+configured`, 302);
}
