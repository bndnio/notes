import { assertSession, assertUser, assertCsrf } from "@/lib/auth";
import { hmacToken, generateRandomHex, encrypt, decrypt } from "@/lib/crypto";
import { createDb } from "@/db";
import * as mcpTokensRepo from "@/db/repositories/mcp-tokens";
import * as mcpTokensKv from "@/kv/repositories/mcp-tokens";
import type { Env } from "@/lib/types";

async function handleGenerateMcpToken(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);

  if ((await mcpTokensRepo.findAllByUserId(db, userId)).length > 0) {
    return Response.redirect(`${env.APP_URL}/profile?toast=Reset+your+MCP+token+before+setting+up+a+new+one`, 302);
  }

  const isRegenerate = form.get("regenerate") === "1";

  const existingPending = await mcpTokensKv.find(userId);
  if (existingPending && !isRegenerate) {
    return Response.redirect(`${env.APP_URL}/profile?modal=mcp-setup`, 302);
  }

  const mcpToken = generateRandomHex(32);
  const encrypted = await encrypt(mcpToken, encryptionKey);

  await mcpTokensKv.put(userId, encrypted);

  return Response.redirect(`${env.APP_URL}/profile?modal=mcp-setup`, 302);
}

async function handleMcpDone(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);

  const encrypted = await mcpTokensKv.find(userId);
  if (encrypted) {
    const mcpToken = await decrypt(encrypted, encryptionKey);
    const hash = await hmacToken(mcpToken, encryptionKey);
    const result = await mcpTokensRepo.create(db, { userId, name: "Default", tokenHash: hash });
    if (result === "limit" || result === "duplicate") {
      return Response.redirect(`${env.APP_URL}/profile?toast=Reset+your+MCP+token+before+setting+up+a+new+one`, 302);
    }
    await mcpTokensKv.remove(userId);
  }

  return Response.redirect(`${env.APP_URL}/profile?toast=MCP+server+configured`, 302);
}

async function handleResetMcpToken(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);

  if ((await mcpTokensRepo.findAllByUserId(db, userId)).length === 0) {
    return Response.redirect(`${env.APP_URL}/profile`, 302);
  }

  await Promise.all([
    mcpTokensRepo.removeAllByUserId(db, userId),
    mcpTokensKv.remove(userId),
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
