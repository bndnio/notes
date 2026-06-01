import profileHtml from "../../templates/profile.html";
import { resolveSessionWithHash, getCsrfToken } from "../../lib/auth";
import { escHtml } from "../../lib/html";
import { createDb } from "../../lib/db";
import * as usersRepo from "../../lib/db/repositories/users";
import { html, renderTemplate, pageVars } from "../../lib/responses";
import type { Env } from "../../lib/types";
import { buildNotionSection } from "./integration/notion";
import { buildMcpSection } from "./setup-mcp";
import { buildEmailSection } from "./email-settings";

export async function handleProfile(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const session = await resolveSessionWithHash(request, env, encryptionKey);
  if (!session) return Response.redirect(`${env.APP_URL}/login`, 302);
  const { userId, sessionHash } = session;

  const db = createDb(env.DB);
  const profile = await usersRepo.findById(db, userId);
  if (!profile) return Response.redirect(`${env.APP_URL}/login`, 302);

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
