import { eq } from "drizzle-orm";
import type { Db } from "..";
import { notes } from "../schema";
import { generateRandomHex } from "@/lib/crypto";

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

export async function removeAllByUserId(db: Db, userId: string): Promise<void> {
  await db.delete(notes).where(eq(notes.userId, userId));
}
