import emailModalHtml from "@/templates/email-modal.html";
import emailScriptHtml from "@/templates/email-script.html";
import emailVerifyPendingHtml from "@/templates/email-verify-pending.html";
import { escHtml } from "@/lib/html";
import { createDb } from "@/db";
import * as userEmailsRepo from "@/db/repositories/user-emails";
import { renderTemplate, renderIntegrationCard } from "@/lib/responses";
import type { Env, Profile, Section } from "@/lib/types";

function buildEmailModal(
  emails: Array<{ email: string }>,
  requireSenderMatch: boolean,
  pendingEmail: string | null,
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

  const pendingSection = pendingEmail
    ? renderTemplate(emailVerifyPendingHtml, { pendingEmail: escHtml(pendingEmail), csrfField })
    : "";

  return renderTemplate(emailModalHtml, {
    emailList,
    pendingSection,
    requireSenderMatchChecked: requireSenderMatch ? "checked" : "",
    csrfField,
  });
}

export async function buildEmailSection(
  profile: Profile,
  userId: string,
  env: Env,
  csrfField: string,
): Promise<Section> {
  const db = createDb(env.DB);
  const [emails, pendingEmail] = await Promise.all([
    userEmailsRepo.findAllByUserId(db, userId),
    env.EPHEMERAL_KV.get(`email_add:${userId}`),
  ]);
  const { requireSenderMatch } = profile;

  const badgeClass = requireSenderMatch ? "status-badge--connected" : "status-badge--none";
  const badgeText = requireSenderMatch ? "Restricted" : "Open";

  const policy = requireSenderMatch
    ? "Only notes from registered addresses are accepted."
    : "Notes from any sender address are accepted.";
  const description = pendingEmail
    ? `${policy} ${escHtml(pendingEmail)} is awaiting PIN verification.`
    : policy;

  return {
    card: renderIntegrationCard({
      name: "Email",
      badgeClass,
      badgeText,
      description,
      action: `<button class="btn btn--ghost" onclick="openEmailModal()">Manage →</button>`,
    }),
    modal: buildEmailModal(emails, requireSenderMatch, pendingEmail, csrfField),
    script: emailScriptHtml,
  };
}
