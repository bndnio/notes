import { assertCsrf, assertSession, assertUser } from "@/lib/auth";
import { createDb } from "@/db";
import * as usersRepo from "@/db/repositories/users";
import * as notesRepo from "@/db/repositories/notes";
import { deleteStoredNotes } from "@/lib/platform-storage";
import type { Env } from "@/lib/types";

export async function handleStorageSettingsSave(request: Request, env: Env): Promise<Response> {
  const encryptionKey = env.SEC_ENCRYPTION_KEY;
  const { userId, sessionHash } = await assertSession(request, env, encryptionKey);

  const db = createDb(env.DB);
  const user = await assertUser(db, userId, env.APP_URL);

  const form = await request.formData();
  await assertCsrf(form, sessionHash, encryptionKey);
  const storageEnabled = form.get("storageEnabled") === "1";

  if (user.storageEnabled && !storageEnabled) {
    await deleteStoredNotes(env.NOTES_BUCKET, userId);
    await notesRepo.removeAllByUserId(db, userId);
    await usersRepo.updateStorageEnabled(db, userId, false);
    return Response.redirect(
      `${env.APP_URL}/profile?toast=Platform+storage+disabled+%E2%80%94+notes+deleted`,
      302,
    );
  }

  if (!user.storageEnabled && storageEnabled) {
    await usersRepo.updateStorageEnabled(db, userId, true);
    return Response.redirect(`${env.APP_URL}/profile?toast=Platform+storage+enabled`, 302);
  }

  return Response.redirect(`${env.APP_URL}/profile?toast=No+changes+to+save`, 302);
}
