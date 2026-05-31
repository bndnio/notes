import { and, asc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "..";
import { userEmails } from "../schema";

export async function create(db: Db, args: { email: string; userId: string }): Promise<void> {
  await db.insert(userEmails).values({ ...args, createdAt: Date.now() });
}

export async function emailExists(db: Db, email: string): Promise<boolean> {
  const row = await db
    .select({ email: userEmails.email })
    .from(userEmails)
    .where(eq(userEmails.email, email))
    .limit(1);
  return row.length > 0;
}

export async function findAllByUserId(
  db: Db,
  userId: string,
): Promise<Array<{ email: string; createdAt: number }>> {
  return db
    .select({ email: userEmails.email, createdAt: userEmails.createdAt })
    .from(userEmails)
    .where(eq(userEmails.userId, userId))
    .orderBy(asc(userEmails.createdAt));
}

// Diffs the current email set against newEmails: deletes removed entries,
// inserts added entries. Existing records are left untouched to preserve
// their createdAt timestamps (the earliest is the primary email).
export async function replaceEmails(db: Db, userId: string, newEmails: string[]): Promise<void> {
  const current = await findAllByUserId(db, userId);
  const currentSet = new Set(current.map((e) => e.email));
  const newSet = new Set(newEmails);

  const toDelete = current.map((e) => e.email).filter((e) => !newSet.has(e));
  const toAdd = newEmails.filter((e) => !currentSet.has(e));

  if (toDelete.length === 0 && toAdd.length === 0) return;

  const now = Date.now();
  const ops: BatchItem<"sqlite">[] = [
    ...toDelete.map((email) =>
      db.delete(userEmails).where(and(eq(userEmails.email, email), eq(userEmails.userId, userId))),
    ),
    ...toAdd.map((email) =>
      db.insert(userEmails).values({ email, userId, createdAt: now }),
    ),
  ];
  await db.batch(ops as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}
