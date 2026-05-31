import profileHtml from "../../templates/profile.html";
import { resolveSession } from "../../lib/auth";
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
  const userId = await resolveSession(request, env, encryptionKey);
  if (!userId) return Response.redirect(`${env.APP_URL}/login`, 302);

  const db = createDb(env.DB);
  const profile = await usersRepo.findById(db, userId);
  if (!profile) return Response.redirect(`${env.APP_URL}/login`, 302);

  const { username } = profile;
  const emailAddress = `u_${username}@${env.EMAIL_DOMAIN}`;

  const [
    { card: notionCard, modal: notionModal, script: notionScript },
    { card: mcpCard, modal: mcpModal, script: mcpScript },
    { card: emailCard, modal: emailModal, script: emailScript },
  ] = await Promise.all([
    buildNotionSection(profile, userId, env),
    buildMcpSection(profile, userId, env, encryptionKey),
    buildEmailSection(profile, userId, env),
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
