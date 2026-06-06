import emailModalHtml from "../../templates/email-modal.html";
import emailScriptHtml from "../../templates/email-script.html";
import { assertSession, assertUser, assertCsrf } from "../../lib/auth";
import { escHtml } from "../../lib/html";
import { createDb } from "../../lib/db";
import * as usersRepo from "../../lib/db/repositories/users";
import * as userEmailsRepo from "../../lib/db/repositories/user-emails";
import { renderTemplate, renderIntegrationCard } from "../../lib/responses";
import type { Env, Profile } from "../../lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildEmailModal(
  emails: Array<{ email: string }>,
  requireSenderMatch: boolean,
  csrfField: string,
): string {
  const emailList = emails
    .map((e, i) => {
      const isPrimary = i === 0;
      const input = isPrimary
        ? `<input type="email" name="email" value="${escHtml(e.email)}" readonly>`
        : `<input type="email" name="email" value="${escHtml(e.email)}" required>`;
      const action = isPrimary
        ? `<span class="email-primary-label">primary</span>`
        : `<button type="button" class="btn btn--ghost btn--sm" onclick="removeEmailRow(this)">Remove</button>`;
      return `<div class="email-row">${input}${action}</div>`;
    })
    .join("\n");

  return renderTemplate(emailModalHtml, {
    emailList,
    requireSenderMatchChecked: requireSenderMatch ? "checked" : "",
    csrfField,
  });
}

export async function buildEmailSection(
  profile: Profile,
  userId: string,
  env: Env,
  csrfField: string,
): Promise<{ card: string; modal: string; script: string }> {
  const db = createDb(env.DB);
  const emails = await userEmailsRepo.findAllByUserId(db, userId);
  const { requireSenderMatch } = profile;

  const badgeClass = requireSenderMatch ? "status-badge--connected" : "status-badge--none";
  const badgeText = requireSenderMatch ? "Restricted" : "Open";
  const description = requireSenderMatch
    ? "Only notes from registered addresses are accepted."
    : "Notes from any sender address are accepted.";

  return {
    card: renderIntegrationCard({
      name: "Email",
      badgeClass,
      badgeText,
      description,
      action: `<button class="btn btn--ghost" onclick="openEmailModal()">Manage →</button>`,
    }),
    modal: buildEmailModal(emails, requireSenderMatch, csrfField),
    script: emailScriptHtml,
  };
}

export async function handleEmailSettingsSave(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  const user = await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);
  const submitted = (form.getAll("email") as string[])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const requireSenderMatch = form.get("requireSenderMatch") === "1";

  if (submitted.length === 0) {
    return Response.redirect(`${env.APP_URL}/profile?toast=At+least+one+email+is+required`, 302);
  }

  if (!submitted.every((e) => EMAIL_RE.test(e))) {
    return Response.redirect(`${env.APP_URL}/profile?toast=Invalid+email+address`, 302);
  }

  if (new Set(submitted).size !== submitted.length) {
    return Response.redirect(`${env.APP_URL}/profile?toast=Duplicate+email+addresses`, 302);
  }

  const currentEmails = await userEmailsRepo.findAllByUserId(db, userId);
  const primaryEmail = currentEmails[0]?.email;
  if (primaryEmail && !submitted.includes(primaryEmail)) {
    return Response.redirect(`${env.APP_URL}/profile?toast=Cannot+remove+primary+email`, 302);
  }

  await Promise.all([
    userEmailsRepo.replaceEmails(db, userId, submitted),
    usersRepo.updateRequireSenderMatch(db, userId, requireSenderMatch),
  ]);

  return Response.redirect(`${env.APP_URL}/profile?toast=Email+settings+saved`, 302);
}
