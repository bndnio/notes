import { eq } from "drizzle-orm";
import type { Db } from "..";
import { users } from "../schema";

const withNotion = { with: { notion: true } } as const;

export function findById(db: Db, id: string) {
  return db.query.users.findFirst({
    where: eq(users.id, id),
    ...withNotion,
  });
}

export function findByUsername(db: Db, username: string) {
  return db.query.users.findFirst({
    where: eq(users.username, username),
    ...withNotion,
  });
}

export function findByMcpTokenHash(db: Db, hash: string) {
  return db.query.users.findFirst({
    where: eq(users.mcpTokenHash, hash),
    ...withNotion,
  });
}

export async function findByEmail(db: Db, email: string) {
  const row = await db.query.userEmails.findFirst({
    where: (userEmails, { eq }) => eq(userEmails.email, email),
    with: { user: { with: { notion: true } } },
  });
  return row?.user ?? null;
}

export async function create(
  db: Db,
  user: { id: string; username: string; requireSenderMatch: boolean },
): Promise<void> {
  await db.insert(users).values({ ...user, createdAt: Date.now() });
}

export async function updateMcpTokenHash(db: Db, id: string, hash: string | null): Promise<void> {
  await db.update(users).set({ mcpTokenHash: hash }).where(eq(users.id, id));
}
