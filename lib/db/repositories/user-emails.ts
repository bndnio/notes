import { eq } from "drizzle-orm";
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
