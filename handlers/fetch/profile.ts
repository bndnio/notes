import profileHtml from "../../templates/profile.html";
import notionSelectModalHtml from "../../templates/notion-select-modal.html";
import { getCookie } from "../../lib/cookies";
import { hmacToken } from "../../lib/crypto";
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
  const sessionToken = getCookie(request, "session");
  if (!sessionToken) return Response.redirect(`${env.APP_URL}/login`, 302);

  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const sessionHash = await hmacToken(sessionToken, encryptionKey);
  const userId = await env.EPHEMERAL_KV.get(`session:${sessionHash}`);
  if (!userId) return Response.redirect(`${env.APP_URL}/login`, 302);

  const profile = await lookupProfile(env.PROFILE_KV, userId);
  if (!profile) return Response.redirect(`${env.APP_URL}/login`, 302);

  const { username, notionDbId, mcpConfigured } = profile;
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

  const mcpBadgeClass = mcpConfigured ? "status-badge--connected" : "status-badge--none";
  const mcpBadgeText = mcpConfigured ? "Configured" : "Not set up";

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
    }),
  );
}
