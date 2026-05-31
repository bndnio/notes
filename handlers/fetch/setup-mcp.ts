import mcpSetupModalHtml from "../../templates/mcp-setup-modal.html";
import mcpScriptHtml from "../../templates/mcp-script.html";
import { resolveSession } from "../../lib/auth";
import { hmacToken, generateRandomHex, encrypt, decrypt } from "../../lib/crypto";
import { createDb } from "../../lib/db";
import * as usersRepo from "../../lib/db/repositories/users";
import { renderTemplate, renderIntegrationCard } from "../../lib/responses";
import type { Env, Profile } from "../../lib/types";

export async function buildMcpSection(
  profile: Profile,
  userId: string,
  env: Env,
  encryptionKey: string,
): Promise<{ card: string; modal: string; script: string }> {
  const pendingEncrypted = await env.EPHEMERAL_KV.get(`mcp_token:${userId}`);
  const mcpToken = pendingEncrypted ? await decrypt(pendingEncrypted, encryptionKey) : null;

  let badgeClass: string;
  let badgeText: string;
  if (profile.mcpTokenHash) { badgeClass = "status-badge--connected"; badgeText = "Configured"; }
  else if (mcpToken) { badgeClass = "status-badge--pending"; badgeText = "Pending"; }
  else { badgeClass = "status-badge--none"; badgeText = "Not set up"; }

  const tokenSection = mcpToken
    ? `<p class="warning">Save this token — it won't be shown after you click Done.</p><div class="token-box">${mcpToken}</div>`
    : "";

  const actionSection = mcpToken
    ? `<form class="form-inline" method="POST" action="/setup-mcp/done"><button type="submit" class="btn">Done →</button></form>`
    : `<div class="btn-row">
        <form class="form-inline" method="POST" action="/setup-mcp/generate">
          <input type="hidden" name="regenerate" value="1">
          <button type="submit" class="btn btn--muted">Regenerate token</button>
        </form>
        <a class="btn" href="/profile">Back →</a>
       </div>`;

  const modal = renderTemplate(mcpSetupModalHtml, { tokenSection, actionSection, appUrl: env.APP_URL });

  const card = renderIntegrationCard({
    name: "MCP Server",
    badgeClass,
    badgeText,
    description: "Connect Notes to Claude Code as an AI tool.",
    action: `<form class="form-inline" method="POST" action="/setup-mcp/generate"><button type="submit" class="btn">Setup →</button></form>`,
  });

  return { card, modal, script: mcpScriptHtml };
}

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
