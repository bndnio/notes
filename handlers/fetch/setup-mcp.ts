import setupMcpHtml from "../../templates/setup-mcp.html";
import { getCookie } from "../../lib/cookies";
import { hmacToken, generateRandomHex } from "../../lib/crypto";
import { lookupProfile } from "../../lib/profiles";
import { html, renderTemplate } from "../../lib/responses";
import type { Env } from "../../lib/types";

export async function handleSetupMcp(request: Request, env: Env): Promise<Response> {
  const sessionToken = getCookie(request, "session");
  if (!sessionToken) return Response.redirect(`${env.APP_URL}/login`, 302);

  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const sessionHash = await hmacToken(sessionToken, encryptionKey);
  const userId = await env.EPHEMERAL_KV.get(`session:${sessionHash}`);
  if (!userId) return Response.redirect(`${env.APP_URL}/login`, 302);

  const profile = await lookupProfile(env.PROFILE_KV, userId);
  if (!profile) return Response.redirect(`${env.APP_URL}/login`, 302);

  let tokenSection = "";

  if (!profile.mcpConfigured) {
    const mcpToken = generateRandomHex(32);
    const mcpTokenHash = await hmacToken(mcpToken, encryptionKey);
    const updatedProfile = { ...profile, mcpConfigured: true };

    await Promise.all([
      env.MCP_TOKEN_KV.put(mcpTokenHash, userId),
      env.PROFILE_KV.put(userId, JSON.stringify(updatedProfile)),
    ]);

    tokenSection = `<p class="warning">Save this token now — it will not be shown again.</p><div class="token-box">${mcpToken}</div>`;
  }

  return html(renderTemplate(setupMcpHtml, { appUrl: env.APP_URL, tokenSection }));
}
