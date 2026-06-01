import emailModalHtml from "../../templates/email-modal.html";
import emailScriptHtml from "../../templates/email-script.html";
import profileHtml from "../../templates/profile.html";
import { assertSession, assertUser, assertCsrf, getCsrfToken } from "../../lib/auth";
import { escHtml } from "../../lib/html";
import { createDb } from "../../lib/db";
import * as usersRepo from "../../lib/db/repositories/users";
import * as userEmailsRepo from "../../lib/db/repositories/user-emails";
import { html, renderTemplate, renderIntegrationCard, pageVars } from "../../lib/responses";
import type { Env, Profile } from "../../lib/types";
import { buildNotionSection } from "./integration/notion";
import { buildMcpSection } from "./setup-mcp";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailSectionOptions = {
  emailValues?: string[];
  modalRequireSenderMatch?: boolean;
  error?: string;
  open?: boolean;
  primaryEmail?: string;
};

function buildEmailModal(
  emails: Array<{ email: string }>,
  requireSenderMatch: boolean,
  csrfField: string,
  options: Pick<EmailSectionOptions, "error" | "open" | "primaryEmail"> = {},
): string {
  let primaryRendered = false;
  const emailList = emails
    .map((e, i) => {
      const isPrimary = options.primaryEmail
        ? !primaryRendered && e.email.trim().toLowerCase() === options.primaryEmail
        : i === 0;
      if (isPrimary) primaryRendered = true;
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
    error: escHtml(options.error ?? ""),
    modalVisibleClass: options.open ? " modal-overlay--visible" : "",
  });
}

export async function buildEmailSection(
  profile: Profile,
  userId: string,
  env: Env,
  csrfField: string,
  options: EmailSectionOptions = {},
): Promise<{ card: string; modal: string; script: string }> {
  const emails = options.emailValues
    ? options.emailValues.map((email) => ({ email }))
    : await userEmailsRepo.findAllByUserId(createDb(env.DB), userId);
  const { requireSenderMatch } = profile;
  const modalRequireSenderMatch = options.modalRequireSenderMatch ?? requireSenderMatch;

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
    modal: buildEmailModal(emails, modalRequireSenderMatch, csrfField, options),
    script: emailScriptHtml,
  };
}

async function renderEmailSettingsError(
  env: Env,
  profile: Profile,
  userId: string,
  sessionHash: string,
  encryptionKey: string,
  submittedEmailValues: string[],
  requireSenderMatch: boolean,
  primaryEmail: string | undefined,
  error: string,
): Promise<Response> {
  const { username } = profile;
  const emailAddress = `u_${username}@${env.EMAIL_DOMAIN}`;
  const csrfToken = await getCsrfToken(sessionHash, encryptionKey);
  const csrfField = `<input type="hidden" name="_csrf" value="${csrfToken}">`;
  const emailValues = submittedEmailValues.length > 0 ? submittedEmailValues : [""];

  const [
    { card: notionCard, modal: notionModal, script: notionScript },
    { card: mcpCard, modal: mcpModal, script: mcpScript },
    { card: emailCard, modal: emailModal, script: emailScript },
  ] = await Promise.all([
    buildNotionSection(profile, userId, env, csrfField),
    buildMcpSection(profile, userId, env, encryptionKey, csrfField),
    buildEmailSection(profile, userId, env, csrfField, {
      emailValues,
      modalRequireSenderMatch: requireSenderMatch,
      error,
      open: true,
      primaryEmail,
    }),
  ]);

  return html(
    renderTemplate(profileHtml, pageVars({
      toast: "",
      csrfField,
      notionModal, notionCard, notionScript,
      mcpModal, mcpCard, mcpScript,
      emailModal, emailCard, emailScript,
      username,
      emailAddress,
    })),
  );
}

export async function handleEmailSettingsSave(request: Request, env: Env): Promise<Response> {
  const encryptionKey = await env.ENCRYPTION_KEY.get();
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  const user = await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);
  const submittedEmailValues = form
    .getAll("email")
    .map((value) => (typeof value === "string" ? value : ""));
  const submitted = submittedEmailValues
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const requireSenderMatch = form.get("requireSenderMatch") === "1";
  const currentEmails = await userEmailsRepo.findAllByUserId(db, userId);
  const primaryEmail = currentEmails[0]?.email;

  if (submitted.length === 0) {
    return renderEmailSettingsError(
      env,
      user,
      userId,
      sessionHash,
      encryptionKey,
      submittedEmailValues,
      requireSenderMatch,
      primaryEmail,
      "At least one email is required.",
    );
  }

  if (!submitted.every((e) => EMAIL_RE.test(e))) {
    return renderEmailSettingsError(
      env,
      user,
      userId,
      sessionHash,
      encryptionKey,
      submittedEmailValues,
      requireSenderMatch,
      primaryEmail,
      "Invalid email address.",
    );
  }

  if (new Set(submitted).size !== submitted.length) {
    return renderEmailSettingsError(
      env,
      user,
      userId,
      sessionHash,
      encryptionKey,
      submittedEmailValues,
      requireSenderMatch,
      primaryEmail,
      "Duplicate email addresses.",
    );
  }

  if (primaryEmail && !submitted.includes(primaryEmail)) {
    return renderEmailSettingsError(
      env,
      user,
      userId,
      sessionHash,
      encryptionKey,
      submittedEmailValues,
      requireSenderMatch,
      primaryEmail,
      "Cannot remove primary email.",
    );
  }

  await Promise.all([
    userEmailsRepo.replaceEmails(db, userId, submitted),
    usersRepo.updateRequireSenderMatch(db, userId, requireSenderMatch),
  ]);

  return Response.redirect(`${env.APP_URL}/profile?toast=Email+settings+saved`, 302);
}
