import { assertSession, assertUser, assertCsrf } from "@/lib/auth";
import { createDb } from "@/db";
import * as usersRepo from "@/db/repositories/users";
import * as userEmailsRepo from "@/db/repositories/user-emails";
import type { Env } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
