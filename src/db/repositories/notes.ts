import { and, asc, count, desc, eq, gt, lt, or } from "drizzle-orm";
import type { Db } from "..";
import { notes } from "../schema";
import { generateRandomHex } from "@/lib/crypto";
import type { NoteSummary } from "@/lib/types";

export const NOTES_PAGE_SIZE = 50;

export interface NoteCursor {
  createdAt: number;
  id: string;
}

export interface NotePage {
  notes: NoteSummary[];
  total: number;
  /** Number of notes newer than the first one on this page. */
  newerCount: number;
}

const summary = {
  id: notes.id,
  subject: notes.subject,
  from: notes.from,
  createdAt: notes.createdAt,
  emailKey: notes.emailKey,
};

// Notes are ordered by (createdAt, id) so the order is total even when timestamps tie.
const newerThan = (c: NoteCursor) =>
  or(gt(notes.createdAt, c.createdAt), and(eq(notes.createdAt, c.createdAt), gt(notes.id, c.id)));
const olderThan = (c: NoteCursor) =>
  or(lt(notes.createdAt, c.createdAt), and(eq(notes.createdAt, c.createdAt), lt(notes.id, c.id)));

export function generateNoteId(): string {
  return generateRandomHex(6);
}

export async function create(
  db: Db,
  note: {
    id: string;
    userId: string;
    r2Key: string;
    emailKey: string | null;
    subject: string;
    from: string;
    createdAt: number;
  },
): Promise<void> {
  await db.insert(notes).values(note);
}

// Newest first. `before` pages towards older notes, `after` towards newer ones.
export async function findPage(
  db: Db,
  userId: string,
  position: { before?: NoteCursor; after?: NoteCursor },
): Promise<NotePage> {
  const byUser = eq(notes.userId, userId);
  let page: NoteSummary[];
  if (position.after) {
    page = (await db.select(summary).from(notes)
      .where(and(byUser, newerThan(position.after)))
      .orderBy(asc(notes.createdAt), asc(notes.id))
      .limit(NOTES_PAGE_SIZE)).reverse();
  } else {
    page = await db.select(summary).from(notes)
      .where(position.before ? and(byUser, olderThan(position.before)) : byUser)
      .orderBy(desc(notes.createdAt), desc(notes.id))
      .limit(NOTES_PAGE_SIZE);
  }

  const first = page[0];
  const [[{ total }], [{ newer }]] = await Promise.all([
    db.select({ total: count() }).from(notes).where(byUser),
    first
      ? db.select({ newer: count() }).from(notes).where(and(byUser, newerThan(first)))
      : Promise.resolve([{ newer: 0 }]),
  ]);

  return { notes: page, total, newerCount: newer };
}

export function findById(db: Db, userId: string, id: string) {
  return db.query.notes.findFirst({
    where: and(eq(notes.id, id), eq(notes.userId, userId)),
  });
}

export async function removeAllByUserId(db: Db, userId: string): Promise<void> {
  await db.delete(notes).where(eq(notes.userId, userId));
}
