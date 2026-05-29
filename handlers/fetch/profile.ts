import profileHtml from "../../templates/profile.html";
import notionSelectModalHtml from "../../templates/notion-select-modal.html";
import mcpSetupModalHtml from "../../templates/mcp-setup-modal.html";
import { resolveSession } from "../../lib/auth";
import { decrypt } from "../../lib/crypto";
import { escHtml } from "../../lib/html";
import { lookupProfile } from "../../lib/profiles";
import { html, renderTemplate } from "../../lib/responses";
import type { Env } from "../../lib/types";

function buildNotionModal(databases: Array<{ id: string; title: string }>): string {
  const databaseOptions = databases
    .map(
      (db) =>
        `<label class="checkbox-label">` +
        `<input type="radio" name="dbId" value="${escHtml(db.id)}" required> ` +
        `${escHtml(db.title)}</label>`,
    )
    .join("\n");

  return renderTemplate(notionSelectModalHtml, { databases: databaseOptions });
}

export async function handleProfile(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const userId = await resolveSession(request, env, encryptionKey);
  if (!userId) return Response.redirect(`${env.APP_URL}/login`, 302);

  const profile = await lookupProfile(env.PROFILE_KV, userId);
  if (!profile) return Response.redirect(`${env.APP_URL}/login`, 302);

  const { username, notionDbId, mcpTokenHash } = profile;
  const emailAddress = `u_${username}@${env.EMAIL_DOMAIN}`;

  let notionBadgeClass: string;
  let notionBadgeText: string;
  let notionDescription: string;
  let notionAction: string;
  let notionModal = "";

  if (notionDbId) {
    notionBadgeClass = "status-badge--connected";
    notionBadgeText = "Connected";
    notionDescription = "Notes are being saved to your Notion database.";
    notionAction = "";
  } else {
    const dbsJson = await env.EPHEMERAL_KV.get(`notion_dbs:${userId}`);
    const databases = dbsJson ? (JSON.parse(dbsJson) as Array<{ id: string; title: string }>) : null;

    if (databases && databases.length > 0) {
      notionBadgeClass = "status-badge--pending";
      notionBadgeText = "Pending";
      notionDescription = "Notion is authorized — choose which database to save notes to.";
      notionAction = `<button class="btn" onclick="openNotionModal()">Select database →</button>`;
      notionModal = buildNotionModal(databases);
    } else {
      notionBadgeClass = "status-badge--none";
      notionBadgeText = "Not connected";
      notionDescription = "Connect Notion to save notes to your workspace.";
      notionAction = `<button class="btn" onclick="openNotionPopup()">Connect →</button>`;
    }
  }

  const mcpBadgeClass = mcpTokenHash ? "status-badge--connected" : "status-badge--none";
  const mcpBadgeText = mcpTokenHash ? "Configured" : "Not set up";

  const pendingMcpToken = await env.EPHEMERAL_KV.get(`mcp_token:${userId}`);
  const mcpToken = pendingMcpToken ? await decrypt(pendingMcpToken, encryptionKey) : null;

  const tokenSection = mcpToken
    ? `<p class="warning">Save this token — it won't be shown after you click Done.</p><div class="token-box">${mcpToken}</div>`
    : "";

  const actionSection = mcpToken
    ? `<a class="btn" href="/setup-mcp/done">Done →</a>`
    : `<div class="btn-row">
        <form class="form-inline" method="POST" action="/setup-mcp/generate">
          <input type="hidden" name="regenerate" value="1">
          <button type="submit" class="btn btn--muted">Regenerate token</button>
        </form>
        <a class="btn" href="/profile">Back →</a>
       </div>`;

  const mcpModal = renderTemplate(mcpSetupModalHtml, { tokenSection, actionSection, appUrl: env.APP_URL });

  const toastParam = new URL(request.url).searchParams.get("toast");
  const toast = toastParam
    ? `<div class="toast" id="toast">${escHtml(toastParam)}<button class="toast-dismiss" id="toast-dismiss">✕</button></div>`
    : "";

  return html(
    renderTemplate(profileHtml, {
      toast,
      notionModal,
      username,
      emailAddress,
      notionBadgeClass,
      notionBadgeText,
      notionDescription,
      notionAction,
      mcpBadgeClass,
      mcpBadgeText,
      mcpModal,
    }),
  );
}
