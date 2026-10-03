export interface StoredNote {
  key: string;
  subject: string;
  date: string;
}

const userPrefix = (userId: string) => `${userId}/`;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export function noteKeys(
  userId: string,
  noteId: string,
  subject: string,
  timestamp: string,
): { mdKey: string; emlKey: string } {
  const dateStamp = timestamp.slice(0, 10);
  const timeStamp = timestamp.slice(11, 16).replace(":", "h");
  const slug = slugify(subject || "untitled");
  const mdKey = `${userPrefix(userId)}${dateStamp}/${timeStamp}-${slug}-${noteId}.md`;
  const emlKey = mdKey.replace(/\.md$/, ".eml");
  return { mdKey, emlKey };
}

export async function listStoredNotes(bucket: R2Bucket, userId: string): Promise<StoredNote[]> {
  const notes: StoredNote[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix: userPrefix(userId), cursor });
    for (const object of page.objects) {
      if (!object.key.endsWith(".md")) continue;
      const parts = object.key.split("/");
      notes.push({
        key: object.key,
        subject: object.customMetadata?.subject ?? parts[2]?.replace(/\.md$/, "") ?? object.key,
        date: parts[1] ?? "",
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return notes.sort((a, b) => b.key.localeCompare(a.key));
}

export async function deleteStoredNotes(bucket: R2Bucket, userId: string): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix: userPrefix(userId), cursor });
    await Promise.all(page.objects.map((object) => bucket.delete(object.key)));
    deleted += page.objects.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return deleted;
}

export interface StoredNoteContent {
  to: string;
  body: string;
}

// Parses the format written by toMarkdown in the R2 sink.
export async function readStoredNote(bucket: R2Bucket, mdKey: string): Promise<StoredNoteContent | null> {
  const object = await bucket.get(mdKey);
  if (!object) return null;
  const raw = await object.text();

  const end = raw.startsWith("---\n") ? raw.indexOf("\n---\n", 4) : -1;
  if (end === -1) return { to: "", body: raw };

  const fields = new Map<string, string>();
  for (const line of raw.slice(4, end).split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) fields.set(line.slice(0, colon), line.slice(colon + 1).trim());
  }
  return {
    to: fields.get("to") ?? "",
    body: raw.slice(end + "\n---\n".length).replace(/^\n/, "").replace(/\n$/, ""),
  };
}
