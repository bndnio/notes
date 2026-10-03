import { assertSession, assertUser, assertCsrf } from "@/lib/auth";
import { hmacToken, generateRandomHex, encrypt, decrypt } from "@/lib/crypto";
import { formField } from "@/lib/form";
import { createDb } from "@/db";
import * as mcpTokensRepo from "@/db/repositories/mcp-tokens";
import * as mcpTokensKv from "@/kv/repositories/mcp-tokens";
import type { Env } from "@/lib/types";

const LIMIT_MESSAGE =
  `You can have up to ${mcpTokensRepo.MAX_TOKENS_PER_USER} MCP tokens. Delete one before creating another.`;

function toManage(env: Env, message: string): Response {
  return Response.redirect(
    `${env.APP_URL}/profile?modal=mcp-manage&toast=${encodeURIComponent(message)}`,
    302,
  );
}

function toSetup(env: Env): Response {
  return Response.redirect(`${env.APP_URL}/profile?modal=mcp-setup`, 302);
}

function validateTokenName(name: string): string | null {
  if (name.length === 0) return "Give the token a name.";
  if (name.length > mcpTokensRepo.MAX_TOKEN_NAME_LENGTH) {
    return `Token names can be at most ${mcpTokensRepo.MAX_TOKEN_NAME_LENGTH} characters.`;
  }
  if (/[\p{Cc}\p{Cf}]/u.test(name)) return "Token names can't contain control characters.";
  return null;
}

function duplicateMessage(name: string): string {
  return `You already have a token named "${name}".`;
}

// Stages a new token in EPHEMERAL_KV. Nothing reaches D1 until Done. With
// regenerate=1, replaces the pending token's secret and keeps its name.
async function handleCreate(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);

  const isRegenerate = formField(form, "regenerate") === "1";
  const existingPending = await mcpTokensKv.find(userId);

  let name: string;
  if (isRegenerate) {
    if (!existingPending) return toManage(env, "That token setup expired. Start again.");
    name = existingPending.name;
  } else {
    if (existingPending) return toSetup(env);
    name = formField(form, "name");
    const nameError = validateTokenName(name);
    if (nameError) return toManage(env, nameError);
  }

  const check = await mcpTokensRepo.checkCanCreate(db, userId, name);
  if (check === "limit") return toManage(env, LIMIT_MESSAGE);
  if (check === "duplicate") return toManage(env, duplicateMessage(name));

  const mcpToken = generateRandomHex(32);
  const encrypted = await encrypt(mcpToken, encryptionKey);
  await mcpTokensKv.put(userId, { name, encrypted });

  return toSetup(env);
}

async function handleDone(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);

  const pending = await mcpTokensKv.find(userId);
  if (!pending) return toManage(env, "That token setup expired. Start again.");

  const mcpToken = await decrypt(pending.encrypted, encryptionKey);
  const tokenHash = await hmacToken(mcpToken, encryptionKey);
  // Re-checked here: another tab may have created tokens since this one was staged.
  const result = await mcpTokensRepo.create(db, { userId, name: pending.name, tokenHash });
  if (result === "limit") return toManage(env, LIMIT_MESSAGE);
  if (result === "duplicate") return toManage(env, duplicateMessage(pending.name));

  await mcpTokensKv.remove(userId);

  console.log(`Created MCP token ${result.id} for user ${userId}`);
  return toManage(env, `MCP token "${pending.name}" saved`);
}

async function handleCancel(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);

  await mcpTokensKv.remove(userId);

  return toManage(env, "Token discarded");
}

async function handleRename(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);

  const id = formField(form, "id");
  const name = formField(form, "name");
  const nameError = validateTokenName(name);
  if (nameError) return toManage(env, nameError);

  const result = await mcpTokensRepo.rename(db, { userId, id, name });
  if (result === "not_found") return toManage(env, "That token no longer exists.");
  if (result === "duplicate") return toManage(env, duplicateMessage(name));

  return toManage(env, `Renamed to "${name}"`);
}

async function handleDelete(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);

  const id = formField(form, "id");
  if (!await mcpTokensRepo.remove(db, userId, id)) {
    return toManage(env, "That token no longer exists.");
  }

  console.log(`Deleted MCP token ${id} for user ${userId}`);
  return toManage(env, "Token deleted. Clients using it have lost access.");
}

export async function handleMcpTokens(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method !== "POST") return new Response("Not found", { status: 404 });

  if (pathname === "/api/mcp/tokens") return handleCreate(request, env);
  if (pathname === "/api/mcp/tokens/done") return handleDone(request, env);
  if (pathname === "/api/mcp/tokens/cancel") return handleCancel(request, env);
  if (pathname === "/api/mcp/tokens/rename") return handleRename(request, env);
  if (pathname === "/api/mcp/tokens/delete") return handleDelete(request, env);

  return new Response("Not found", { status: 404 });
}
