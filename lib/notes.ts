import { postToNotion } from "./destinations/notion";
import { toMarkdown, slugify } from "./markdown";
import { decrypt } from "./crypto";
import type { Content, Env, Profile } from "./types";

interface SaveNoteResult {
  mdKey: string;
  notionOk: boolean;
}

function computeKeys(subject: string, userId: string, timestamp: string): { mdKey: string; emlKey: string } {
  const dateStamp = timestamp.slice(0, 10);
  const timeStamp = timestamp.slice(11, 16).replace(":", "h");
  const slug = slugify(subject || "untitled");
  const mdKey = `${userId}/${dateStamp}/${timeStamp}-${slug}.md`;
  const emlKey = mdKey.replace(".md", ".eml");
  return { mdKey, emlKey };
}

export async function saveNote(
  content: Content,
  env: Env,
  profile: Profile,
  artifacts?: { rawEmail?: string },
): Promise<SaveNoteResult> {
  const { mdKey, emlKey } = computeKeys(content.subject, profile.id, content.timestamp);
  const stored: Content = {
    ...content,
    subject: content.subject || "(no subject)",
  };

  const saveEml = artifacts?.rawEmail
    ? env.NOTES_BUCKET.put(emlKey, artifacts.rawEmail, {
        httpMetadata: { contentType: "message/rfc822" },
      })
    : Promise.resolve();

  const saveMd = env.NOTES_BUCKET.put(mdKey, toMarkdown(stored, artifacts?.rawEmail ? emlKey : undefined), {
    httpMetadata: { contentType: "text/markdown" },
    customMetadata: { subject: stored.subject, from: stored.from },
  });

  let notionWrite: Promise<unknown>;
  if (profile.notion) {
    const encryptionKey = env.SEC_ENCRYPTION_KEY;
    const notionToken = await decrypt(profile.notion.accessTokenEncrypted, encryptionKey);
    notionWrite = postToNotion(stored, notionToken, profile.notion.databaseId);
  } else {
    notionWrite = Promise.reject("not configured");
  }

  const [emlResult, r2Result, notionResult] = await Promise.allSettled([saveEml, saveMd, notionWrite]);

  if (artifacts?.rawEmail) {
    if (emlResult.status === "rejected") console.error(`R2 eml write failed: ${emlResult.reason}`);
    else console.log(`Saved eml: ${emlKey}`);
  }

  if (r2Result.status === "rejected") {
    throw new Error(`R2 write failed: ${r2Result.reason}`);
  }

  return { mdKey, notionOk: notionResult.status === "fulfilled" };
}
