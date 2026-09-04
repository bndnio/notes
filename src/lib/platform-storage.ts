export interface StoredNote {
  key: string;
  subject: string;
  date: string;
}

const userPrefix = (userId: string) => `${userId}/`;

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
