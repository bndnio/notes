import { postToNotion } from "./destinations/notion";
import { toMarkdown, slugify } from "./markdown";
import { decrypt } from "./crypto";
import type { Env, Note, Profile } from "./types";

interface SaveNoteInput {
  mdKey: string;
  timestamp: string;
  subject: string;
  body: string;
  from?: string;
  to?: string;
  emlKey?: string;
}

interface SaveNoteResult {
  notionOk: boolean;
}

export function computeKeys(subject: string, userId: string, timestamp: string): { mdKey: string; emlKey: string } {
  const dateStamp = timestamp.slice(0, 10);
  const timeStamp = timestamp.slice(11, 16).replace(":", "h");
  const slug = slugify(subject || "untitled");
  const mdKey = `${userId}/${dateStamp}/${timeStamp}-${slug}.md`;
  const emlKey = mdKey.replace(".md", ".eml");
  return { mdKey, emlKey };
}

export async function saveNote(input: SaveNoteInput, env: Env, profile: Profile): Promise<SaveNoteResult> {
  const note: Note = {
    timestamp: input.timestamp,
    from: input.from ?? "mcp",
    to: input.to ?? "",
    subject: input.subject || "(no subject)",
    body: input.body,
    ...(input.emlKey && { emlKey: input.emlKey }),
  };

  const saveMd = env.NOTES_BUCKET.put(input.mdKey, toMarkdown(note), {
    httpMetadata: { contentType: "text/markdown" },
    customMetadata: { subject: note.subject, from: note.from },
  });

  let notionWrite: Promise<unknown>;
  if (profile.notion) {
    const encryptionKey = env.SEC_ENCRYPTION_KEY;
    const notionToken = await decrypt(profile.notion.accessTokenEncrypted, encryptionKey);
    notionWrite = postToNotion(note, notionToken, profile.notion.databaseId);
  } else {
    notionWrite = Promise.reject("not configured");
  }

  const [r2Result, notionResult] = await Promise.allSettled([saveMd, notionWrite]);

  if (r2Result.status === "rejected") {
    throw new Error(`R2 write failed: ${r2Result.reason}`);
  }

  return { notionOk: notionResult.status === "fulfilled" };
}
