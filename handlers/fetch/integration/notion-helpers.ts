import { fetchNotion } from "../../../lib/destinations/notion";
import { encrypt } from "../../../lib/crypto";
import { lookupProfile } from "../../../lib/profiles";
import type { Env } from "../../../lib/types";

export interface NotionItem {
  id: string;
  title: string;
}

interface NotionTitleProperty {
  type: "title";
  title: Array<{ plain_text?: string }>;
}

interface NotionSearchResult {
  id: string;
  object: "page" | "database";
  title?: Array<{ plain_text?: string }>;
  properties?: Record<string, { type: string } | NotionTitleProperty>;
}

interface NotionSearchResponse {
  results: NotionSearchResult[];
  has_more: boolean;
  next_cursor: string | null;
}

function extractTitle(result: NotionSearchResult): string {
  if (result.object === "database") {
    return result.title?.[0]?.plain_text ?? "(untitled)";
  }
  const titleProp = Object.values(result.properties ?? {}).find(
    (p): p is NotionTitleProperty => p.type === "title",
  );
  return titleProp?.title?.[0]?.plain_text ?? "(untitled)";
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

export async function listNotionItems(accessToken: string): Promise<NotionItem[]> {
  const items: NotionItem[] = [];
  let cursor: string | null = null;

  do {
    const body: Record<string, unknown> = {};
    if (cursor) body.start_cursor = cursor;

    const res = await fetchNotion("/search", accessToken, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) break;

    const data = (await res.json()) as NotionSearchResponse;
    for (const result of data.results) {
      items.push({ id: result.id, title: extractTitle(result) });
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return items;
}

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
