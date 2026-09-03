import { streamToText, parseEmail } from "../lib/email";
import { saveNote } from "../lib/notes";
import { createDb } from "../lib/db";
import * as usersRepo from "../lib/db/repositories/users";
import type { Content, Env } from "../lib/types";

export async function handleEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const localPart = (message.to ?? "").split("@")[0];
  if (!localPart.startsWith("u_")) {
    console.warn(`Rejected email to unknown address: ${message.to}`);
    message.setReject("Address not found");
    return;
  }
  const username = localPart.slice(2);

  const db = createDb(env.DB);
  const profile = await usersRepo.findByUsername(db, username);
  if (!profile) {
    console.warn(`Rejected email to unknown username: ${username}`);
    message.setReject("Address not found");
    return;
  }

  if (profile.requireSenderMatch) {
    const senderUser = await usersRepo.findByEmail(db, message.from ?? "");
    if (senderUser?.id !== profile.id) {
      console.warn(`Rejected email from unregistered sender: ${message.from} → ${username}`);
      message.setReject("Sender not authorised");
      return;
    }
  }

  const rawEmail = await streamToText(message.raw);
  const parsed = parseEmail(rawEmail);

  const content: Content = {
    timestamp: new Date().toISOString(),
    from: message.from ?? "",
    to: message.to ?? "",
    subject: parsed.subject,
    body: parsed.body,
  };

  await saveNote(content, env, profile, { rawEmail });
}
