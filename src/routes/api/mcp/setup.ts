import { assertSession, assertUser, assertCsrf } from "../../../lib/auth";
import { hmacToken, generateRandomHex, encrypt, decrypt } from "../../../lib/crypto";
import { createDb } from "../../../lib/db";
import * as usersRepo from "../../../lib/db/repositories/users";
import type { Env } from "../../../lib/types";

async function handleGenerateMcpToken(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  const user = await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);

  if (user.mcpTokenHash) {
    return Response.redirect(`${env.APP_URL}/profile?toast=Reset+your+MCP+token+before+setting+up+a+new+one`, 302);
  }

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

async function handleMcpDone(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  const user = await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);

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

async function handleResetMcpToken(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  const user = await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);

  if (!user.mcpTokenHash) {
    return Response.redirect(`${env.APP_URL}/profile`, 302);
  }

  await Promise.all([
    usersRepo.updateMcpTokenHash(db, userId, null),
    env.EPHEMERAL_KV.delete(`mcp_token:${userId}`),
  ]);

  return Response.redirect(`${env.APP_URL}/profile?toast=MCP+token+reset.+Set+up+a+new+one+when+ready.`, 302);
}

export async function handleMcpSetup(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname === "/api/mcp/setup/generate" && request.method === "POST") {
    return handleGenerateMcpToken(request, env);
  }
  if (pathname === "/api/mcp/setup/reset" && request.method === "POST") {
    return handleResetMcpToken(request, env);
  }
  if (pathname === "/api/mcp/setup/done" && request.method === "POST") {
    return handleMcpDone(request, env);
  }

  return new Response("Not found", { status: 404 });
}
