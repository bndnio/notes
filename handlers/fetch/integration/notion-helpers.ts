import { fetchNotion } from "../../../lib/destinations/notion";
import { encrypt } from "../../../lib/crypto";
import { lookupProfile } from "../../../lib/profiles";
import type { Env } from "../../../lib/types";

export interface NotionDatabase {
  id: string;
  title: string;
}

interface NotionSearchResponse {
  results: Array<{
    id: string;
    object: string;
    title?: Array<{ plain_text?: string }>;
  }>;
  has_more: boolean;
  next_cursor: string | null;
}

interface NotionBlockListResponse {
  results: Array<{
    id: string;
    type: string;
    has_children: boolean;
    child_database?: { title: string };
  }>;
  has_more: boolean;
  next_cursor: string | null;
}

async function searchObjectIds(accessToken: string, objectType: "page" | "database"): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;

  do {
    const body: Record<string, unknown> = {
      filter: { value: objectType, property: "object" },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;

    const res = await fetchNotion("/search", accessToken, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) break;

    const data = (await res.json()) as NotionSearchResponse;
    for (const result of data.results) {
      if (result.object === objectType) ids.push(result.id);
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return ids;
}

async function collectDatabasesFromBlocks(
  blockId: string,
  accessToken: string,
  byId: Map<string, NotionDatabase>,
): Promise<void> {
  let cursor: string | null = null;

  do {
    const query = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : "";
    const res = await fetchNotion(`/blocks/${blockId}/children${query}`, accessToken);
    if (!res.ok) return;

    const data = (await res.json()) as NotionBlockListResponse;
    for (const block of data.results) {
      if (block.type === "child_database") {
        if (!byId.has(block.id)) {
          byId.set(block.id, {
            id: block.id,
            title: block.child_database?.title || "(untitled)",
          });
        }
        continue;
      }
      if (block.has_children) {
        await collectDatabasesFromBlocks(block.id, accessToken, byId);
      }
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
}

export async function completeNotionSetup(userId: string, accessToken: string, dbId: string, env: Env): Promise<void> {
  const [encryptionKey, profile] = await Promise.all([
    env.ENCRYPTION_KEY.get(),
    lookupProfile(env.PROFILE_KV, userId),
  ]);
  if (!profile) throw new Error(`No profile for userId: ${userId}`);
  const encrypted = await encrypt(accessToken, encryptionKey);
  await Promise.all([
    env.NOTION_TOKEN_KV.put(userId, encrypted),
    env.PROFILE_KV.put(userId, JSON.stringify({ ...profile, notionDbId: dbId })),
  ]);
}

/** Databases from search plus child_database blocks under shared pages. */
export async function listDatabases(accessToken: string): Promise<NotionDatabase[]> {
  const byId = new Map<string, NotionDatabase>();
  let cursor: string | null = null;

  do {
    const body: Record<string, unknown> = {
      filter: { value: "database", property: "object" },
    };
    if (cursor) body.start_cursor = cursor;

    const res = await fetchNotion("/search", accessToken, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) break;

    const data = (await res.json()) as NotionSearchResponse;
    for (const result of data.results) {
      if (result.object !== "database") continue;
      byId.set(result.id, {
        id: result.id,
        title: result.title?.[0]?.plain_text ?? "(untitled)",
      });
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  const pageIds = await searchObjectIds(accessToken, "page");
  for (const pageId of pageIds) {
    await collectDatabasesFromBlocks(pageId, accessToken, byId);
  }

  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
