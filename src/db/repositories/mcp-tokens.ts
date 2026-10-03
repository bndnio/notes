import { and, asc, eq } from "drizzle-orm";
import type { Db } from "..";
import { mcpTokens } from "../schema";
import { generateRandomHex } from "@/lib/crypto";
import type { McpTokenSummary } from "@/lib/types";

export const MAX_TOKENS_PER_USER = 10;
export const MAX_TOKEN_NAME_LENGTH = 40;

// last_used_at is only rewritten once it is older than this, so MCP calls don't
// each cost a D1 write.
const LAST_USED_RESOLUTION_MS = 60 * 60 * 1000;

export function findAllByUserId(db: Db, userId: string): Promise<McpTokenSummary[]> {
  return db
    .select({
      id: mcpTokens.id,
      name: mcpTokens.name,
      createdAt: mcpTokens.createdAt,
      lastUsedAt: mcpTokens.lastUsedAt,
    })
    .from(mcpTokens)
    .where(eq(mcpTokens.userId, userId))
    .orderBy(asc(mcpTokens.createdAt));
}

export function findByHash(db: Db, tokenHash: string) {
  return db.query.mcpTokens.findFirst({
    where: eq(mcpTokens.tokenHash, tokenHash),
    with: { user: { with: { notion: true } } },
  });
}

export async function checkCanCreate(
  db: Db,
  userId: string,
  name: string,
): Promise<"ok" | "limit" | "duplicate"> {
  const existing = await db
    .select({ name: mcpTokens.name })
    .from(mcpTokens)
    .where(eq(mcpTokens.userId, userId));
  if (existing.length >= MAX_TOKENS_PER_USER) return "limit";
  if (existing.some((t) => t.name === name)) return "duplicate";
  return "ok";
}

export async function create(
  db: Db,
  args: { userId: string; name: string; tokenHash: string },
): Promise<{ id: string } | "limit" | "duplicate"> {
  const check = await checkCanCreate(db, args.userId, args.name);
  if (check !== "ok") return check;

  const id = generateRandomHex(4);
  await db.insert(mcpTokens).values({ ...args, id, createdAt: Date.now() });
  return { id };
}

export async function rename(
  db: Db,
  args: { userId: string; id: string; name: string },
): Promise<"renamed" | "not_found" | "duplicate"> {
  const clash = await db
    .select({ id: mcpTokens.id })
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, args.userId), eq(mcpTokens.name, args.name)))
    .limit(1);
  if (clash.length > 0 && clash[0].id !== args.id) return "duplicate";

  const updated = await db
    .update(mcpTokens)
    .set({ name: args.name })
    .where(and(eq(mcpTokens.id, args.id), eq(mcpTokens.userId, args.userId)))
    .returning({ id: mcpTokens.id });
  return updated.length > 0 ? "renamed" : "not_found";
}

export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(mcpTokens)
    .where(and(eq(mcpTokens.id, id), eq(mcpTokens.userId, userId)))
    .returning({ id: mcpTokens.id });
  return deleted.length > 0;
}

export async function recordUse(
  db: Db,
  token: { id: string; lastUsedAt: number | null },
): Promise<void> {
  const now = Date.now();
  if (token.lastUsedAt !== null && now - token.lastUsedAt < LAST_USED_RESOLUTION_MS) return;
  await db.update(mcpTokens).set({ lastUsedAt: now }).where(eq(mcpTokens.id, token.id));
}
