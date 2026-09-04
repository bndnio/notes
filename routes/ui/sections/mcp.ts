import mcpSetupModalHtml from "../../../templates/mcp-setup-modal.html";
import mcpScriptHtml from "../../../templates/mcp-script.html";
import { decrypt } from "../../../lib/crypto";
import { escHtml } from "../../../lib/html";
import { renderTemplate, renderIntegrationCard } from "../../../lib/responses";
import type { Env, Profile, Section } from "../../../lib/types";

export async function buildMcpSection(
  profile: Profile,
  userId: string,
  env: Env,
  encryptionKey: string,
  csrfField: string,
): Promise<Section> {
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
    ? `<form class="form-inline" method="POST" action="/api/mcp/setup/done">${csrfField}<button type="submit" class="btn">Done →</button></form>`
    : `<div class="btn-row">
        <form class="form-inline" method="POST" action="/api/mcp/setup/generate">${csrfField}<input type="hidden" name="regenerate" value="1"><button type="submit" class="btn btn--ghost">Regenerate token</button></form>
        <a class="btn btn--ghost" href="/profile">Back →</a>
       </div>`;

  const modal = renderTemplate(mcpSetupModalHtml, { tokenSection, actionSection, appUrl: env.APP_URL });

  const cardAction = profile.mcpTokenHash
    ? `<div class="btn-row">
        <form class="form-inline" method="POST" action="/api/mcp/setup/reset" onsubmit="return confirmResetMcp()">${csrfField}<button type="submit" class="btn btn--ghost btn--sm">Reset</button></form>
        <button type="button" class="btn btn--ghost" disabled>Setup →</button>
       </div>`
    : `<form class="form-inline" method="POST" action="/api/mcp/setup/generate">${csrfField}<button type="submit" class="btn btn--red">Setup →</button></form>`;

  const card = renderIntegrationCard({
    name: "MCP Server",
    badgeClass,
    badgeText,
    description: "Connect Notes to Claude Code as an AI tool.",
    action: cardAction,
  });

  return { card, modal, script: mcpScriptHtml };
}
