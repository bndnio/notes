import { sql } from "drizzle-orm";
import type { Db } from "..";
import { notionIntegrations } from "../schema";

export async function upsert(
  db: Db,
  args: { userId: string; databaseId: string; accessTokenEncrypted: string },
): Promise<void> {
  const now = Date.now();
  await db
    .insert(notionIntegrations)
    .values({ ...args, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: notionIntegrations.userId,
      set: {
        databaseId: args.databaseId,
        accessTokenEncrypted: args.accessTokenEncrypted,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}
