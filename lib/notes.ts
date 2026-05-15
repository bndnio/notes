import { postToNotion } from "./notion";
import { toMarkdown, slugify } from "./markdown";
import { resolveNotionToken } from "./tokens";
import type { Env, Note, Profile } from "./types";

interface SaveNoteInput {
  mdKey: string;
  subject: string;
  body: string;
  from?: string;
  to?: string;
  emlKey?: string;
}

interface SaveNoteResult {
  notionOk: boolean;
}

export function computeKeys(subject: string, userId: string): { mdKey: string; emlKey: string } {
  const timestamp = new Date().toISOString();
  const dateStamp = timestamp.slice(0, 10);
  const timeStamp = timestamp.slice(11, 16).replace(":", "h");
  const slug = slugify(subject || "untitled");
  const mdKey = `${userId}/${dateStamp}/${timeStamp}-${slug}.md`;
  const emlKey = mdKey.replace(".md", ".eml");
  return { mdKey, emlKey };
}

export async function saveNote(input: SaveNoteInput, env: Env, profile: Profile): Promise<SaveNoteResult> {
  const note: Note = {
    timestamp: new Date().toISOString(),
    from: input.from ?? "mcp",
    to: input.to ?? "",
    subject: input.subject || "(no subject)",
    body: input.body,
    ...(input.emlKey && { emlKey: input.emlKey }),
  };

  const notionToken = await resolveNotionToken(profile.userId, env);

  const saveMd = env.NOTES_BUCKET.put(input.mdKey, toMarkdown(note), {
    httpMetadata: { contentType: "text/markdown" },
    customMetadata: { subject: note.subject, from: note.from },
  });

  const [r2Result, notionResult] = await Promise.allSettled([saveMd, postToNotion(note, notionToken, profile.notionDbId)]);

  if (r2Result.status === "rejected") {
    throw new Error(`R2 write failed: ${r2Result.reason}`);
  }

  return { notionOk: notionResult.status === "fulfilled" };
}
