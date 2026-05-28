import profileHtml from "../../templates/profile.html";
import { getCookie } from "../../lib/cookies";
import { hmacToken } from "../../lib/crypto";
import { escHtml } from "../../lib/html";
import { lookupProfile } from "../../lib/profiles";
import { html, renderTemplate } from "../../lib/responses";
import type { Env } from "../../lib/types";

export async function handleProfile(request: Request, env: Env): Promise<Response> {
  const sessionToken = getCookie(request, "session");
  if (!sessionToken) return Response.redirect(`${env.APP_URL}/login`, 302);

  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const sessionHash = await hmacToken(sessionToken, encryptionKey);
  const userId = await env.EPHEMERAL_KV.get(`session:${sessionHash}`);
  if (!userId) return Response.redirect(`${env.APP_URL}/login`, 302);

  const profile = await lookupProfile(env.PROFILE_KV, userId);
  if (!profile) return Response.redirect(`${env.APP_URL}/login`, 302);

  const { username, notionDbId, notionPending } = profile;
  const emailAddress = `u_${username}@${env.EMAIL_DOMAIN}`;

  let notionBadgeClass: string;
  let notionBadgeText: string;
  let notionDescription: string;
  let notionAction: string;

  if (notionDbId) {
    notionBadgeClass = "status-badge--connected";
    notionBadgeText = "Connected";
    notionDescription = "Notes are being saved to your Notion database.";
    notionAction = "";
  } else if (notionPending) {
    notionBadgeClass = "status-badge--pending";
    notionBadgeText = "Pending";
    notionDescription = "Notion is authorized — choose which database to save notes to.";
    notionAction = `<a class="btn" href="/integration/notion/select">Select database →</a>`;
  } else {
    notionBadgeClass = "status-badge--none";
    notionBadgeText = "Not connected";
    notionDescription = "Connect Notion to save notes to your workspace.";
    notionAction = `<a class="btn" href="/integration/notion/connect">Connect →</a>`;
  }

  const toastParam = new URL(request.url).searchParams.get("toast");
  const toast = toastParam
    ? `<div class="toast" id="toast">${escHtml(toastParam)}<button class="toast-dismiss" id="toast-dismiss">✕</button></div>`
    : "";

  return html(
    renderTemplate(profileHtml, {
      toast,
      username,
      emailAddress,
      notionBadgeClass,
      notionBadgeText,
      notionDescription,
      notionAction,
    }),
  );
}
