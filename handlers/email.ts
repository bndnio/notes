import { streamToText, parseEmail } from "../lib/email";
import { computeKeys, saveNote } from "../lib/notes";
import { createDb } from "../lib/db";
import * as usersRepo from "../lib/db/repositories/users";
import type { Env } from "../lib/types";

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

  const timestamp = new Date().toISOString();
  const { mdKey, emlKey } = computeKeys(parsed.subject, profile.id, timestamp);

  const saveEml = env.NOTES_BUCKET.put(emlKey, rawEmail, {
    httpMetadata: { contentType: "message/rfc822" },
  });

  const [emlResult, noteResult] = await Promise.allSettled([
    saveEml,
    saveNote({ mdKey, timestamp, subject: parsed.subject, body: parsed.body, from: message.from, to: message.to, emlKey }, env, profile),
  ]);

  if (emlResult.status === "rejected") console.error(`R2 eml write failed: ${emlResult.reason}`);
  else console.log(`Saved eml: ${emlKey}`);

  if (noteResult.status === "rejected") console.error(`R2 md write failed (Notion status unknown): ${noteResult.reason}`);
  else {
    console.log(`Saved md: ${mdKey}`);
    if (!noteResult.value.notionOk) console.error("Notion write failed (md saved successfully)");
    else console.log("Saved to Notion");
  }
}
