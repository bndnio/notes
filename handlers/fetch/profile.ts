import profileHtml from "../../templates/profile.html";
import { assertSession, assertUser, getCsrfToken } from "../../lib/auth";
import { escHtml } from "../../lib/html";
import { createDb } from "../../lib/db";
import { html, renderTemplate, pageVars } from "../../lib/responses";
import type { Env } from "../../lib/types";
import { buildNotionSection } from "./integration/notion";
import { buildMcpSection } from "./setup-mcp";
import { buildEmailSection } from "./email-settings";

export async function handleProfile(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  const profile = await assertUser(db, userId, env.APP_URL);

  const { username } = profile;
  const emailAddress = `u_${username}@${env.EMAIL_DOMAIN}`;

  const csrfToken = await getCsrfToken(sessionHash, encryptionKey);
  const csrfField = `<input type="hidden" name="_csrf" value="${csrfToken}">`;

  const [
    { card: notionCard, modal: notionModal, script: notionScript },
    { card: mcpCard, modal: mcpModal, script: mcpScript },
    { card: emailCard, modal: emailModal, script: emailScript },
  ] = await Promise.all([
    buildNotionSection(profile, userId, env, csrfField),
    buildMcpSection(profile, userId, env, encryptionKey, csrfField),
    buildEmailSection(profile, userId, env, csrfField),
  ]);

  const toastParam = new URL(request.url).searchParams.get("toast");
  const toast = toastParam
    ? `<div class="toast" id="toast">${escHtml(toastParam)}<button class="toast-dismiss" id="toast-dismiss">✕</button></div>`
    : "";

  return html(
    renderTemplate(profileHtml, pageVars({
      toast,
      notionModal, notionCard, notionScript,
      mcpModal, mcpCard, mcpScript,
      emailModal, emailCard, emailScript,
      username,
      emailAddress,
    })),
  );
}
