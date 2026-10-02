import emailModalHtml from "@/templates/components/email/modal.html";
import emailRowHtml from "@/templates/components/email/row.html";
import emailRowPrimaryHtml from "@/templates/components/email/row-primary.html";
import emailScriptHtml from "@/templates/components/email/script.html";
import emailVerifyPendingHtml from "@/templates/components/email/verify-pending.html";
import { escHtml } from "@/lib/html";
import { createDb } from "@/db";
import * as userEmailsRepo from "@/db/repositories/user-emails";
import * as emailAddsKv from "@/kv/repositories/email-adds";
import { renderTemplate, renderIntegrationCard } from "@/lib/responses";
import type { Env, Profile, Section } from "@/lib/types";

function buildEmailModal(
  emails: Array<{ email: string }>,
  requireSenderMatch: boolean,
  pendingEmail: string | null,
  csrfField: string,
): string {
  const emailList = emails
    .map((e, i) => renderTemplate(i === 0 ? emailRowPrimaryHtml : emailRowHtml, {
      email: escHtml(e.email),
    }))
    .join("\n");

  const pendingSection = pendingEmail
    ? renderTemplate(emailVerifyPendingHtml, { pendingEmail: escHtml(pendingEmail), csrfField })
    : "";

  return renderTemplate(emailModalHtml, {
    emailList,
    pendingSection,
    requireSenderMatchChecked: requireSenderMatch ? "checked" : "",
    addHidden: pendingEmail ? "hidden" : "",
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
    emailAddsKv.find(userId),
  ]);
  const { requireSenderMatch } = profile;

  let badgeClass: string;
  let badgeText: string;
  if (pendingEmail) {
    badgeClass = "status-badge--pending";
    badgeText = "Pending";
  } else if (requireSenderMatch) {
    badgeClass = "status-badge--connected";
    badgeText = "Restricted";
  } else {
    badgeClass = "status-badge--none";
    badgeText = "Open";
  }

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
