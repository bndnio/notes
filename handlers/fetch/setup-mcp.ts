import mcpSetupModalHtml from "../../templates/mcp-setup-modal.html";
import mcpScriptHtml from "../../templates/mcp-script.html";
import { assertSession, assertUser, assertCsrf } from "../../lib/auth";
import { hmacToken, generateRandomHex, encrypt, decrypt } from "../../lib/crypto";
import { createDb } from "../../lib/db";
import * as usersRepo from "../../lib/db/repositories/users";
import { escHtml } from "../../lib/html";
import { renderTemplate, renderIntegrationCard } from "../../lib/responses";
import type { Env, Profile } from "../../lib/types";

export async function buildMcpSection(
  profile: Profile,
  userId: string,
  env: Env,
  encryptionKey: string,
  csrfField: string,
): Promise<{ card: string; modal: string; script: string }> {
  const pendingEncrypted = await env.EPHEMERAL_KV.get(`mcp_token:${userId}`);
  const mcpToken = pendingEncrypted ? await decrypt(pendingEncrypted, encryptionKey) : null;

  let badgeClass: string;
  let badgeText: string;
  if (profile.mcpTokenHash) { badgeClass = "status-badge--connected"; badgeText = "Configured"; }
  else if (mcpToken) { badgeClass = "status-badge--pending"; badgeText = "Pending"; }
  else { badgeClass = "status-badge--none"; badgeText = "Not set up"; }

  const tokenSection = mcpToken
    ? `<p class="warning">Save this token — it won't be shown after you click Done.</p><div class="token-box">${escHtml(mcpToken)}</div>`
    : "";

  const actionSection = mcpToken
    ? `<form class="form-inline" method="POST" action="/setup-mcp/done">${csrfField}<button type="submit" class="btn">Done →</button></form>`
    : `<div class="btn-row">
        <form class="form-inline" method="POST" action="/setup-mcp/generate">${csrfField}<input type="hidden" name="regenerate" value="1"><button type="submit" class="btn btn--ghost">Regenerate token</button></form>
        <a class="btn btn--ghost" href="/profile">Back →</a>
       </div>`;

  const modal = renderTemplate(mcpSetupModalHtml, { tokenSection, actionSection, appUrl: env.APP_URL });

  const cardAction = profile.mcpTokenHash
    ? `<div class="btn-row">
        <button type="button" class="btn btn--red" disabled>Setup →</button>
        <form class="form-inline" method="POST" action="/setup-mcp/reset" onsubmit="return confirmResetMcp()">${csrfField}<button type="submit" class="btn btn--ghost btn--sm">Reset</button></form>
       </div>`
    : `<form class="form-inline" method="POST" action="/setup-mcp/generate">${csrfField}<button type="submit" class="btn btn--red">Setup →</button></form>`;

  const card = renderIntegrationCard({
    name: "MCP Server",
    badgeClass,
    badgeText,
    description: "Connect Notes to Claude Code as an AI tool.",
    action: cardAction,
  });

  return { card, modal, script: mcpScriptHtml };
}

export async function handleGenerateMcpToken(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
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

export async function handleMcpDone(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
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

export async function handleResetMcpToken(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
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
