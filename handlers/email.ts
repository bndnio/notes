import { streamToText, parseEmail } from "../lib/email";
import { computeKeys, saveNote } from "../lib/notes";
import { lookupUserId } from "../lib/senders";
import { lookupProfile } from "../lib/profiles";
import type { Env } from "../lib/types";

export async function handleEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const userId = await lookupUserId(env.USER_INDEX_KV, message.from ?? "");

  if (!userId) {
    console.warn(`Rejected email from: ${message.from}`);
    message.setReject("Address not allowed");
    return;
  }

  const profile = await lookupProfile(env.PROFILE_KV, userId);
  if (!profile) {
    console.warn(`No profile for userId: ${userId}`);
    message.setReject("Address not allowed");
    return;
  }

  const rawEmail = await streamToText(message.raw);
  const parsed = parseEmail(rawEmail);

  const timestamp = new Date().toISOString();
  const { mdKey, emlKey } = computeKeys(parsed.subject, profile.userId, timestamp);

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
