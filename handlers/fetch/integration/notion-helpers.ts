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

export async function listDatabases(accessToken: string): Promise<NotionDatabase[]> {
  const byId = new Map<string, NotionDatabase>();
  let cursor: string | null = null;

  do {
    const body: Record<string, unknown> = {
      filter: { value: "database", property: "object" },
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
      if (result.object !== "database") continue;
      byId.set(result.id, {
        id: result.id,
        title: result.title?.[0]?.plain_text ?? "(untitled)",
      });
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}

