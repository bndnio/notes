import { fetchNotion } from "../../../lib/destinations/notion";
import { createDb } from "../../../lib/db";
import * as notionIntegrations from "../../../lib/db/repositories/notion-integrations";
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

const REQUIRED_PROPERTIES = [
  { name: "Name", type: "title", label: "Title" },
  { name: "Date", type: "date", label: "Date" },
  { name: "From", type: "rich_text", label: "Text" },
] as const;

interface NotionDatabaseSchema {
  properties: Record<string, { type: string }>;
}

export type NotionSchemaValidation =
  | { ok: true }
  | { ok: false; message: string };

export async function validateNotionDatabaseSchema(
  accessToken: string,
  databaseId: string,
): Promise<NotionSchemaValidation> {
  const res = await fetchNotion(`/databases/${databaseId}`, accessToken);
  if (!res.ok) {
    return { ok: false, message: "Could not read the database schema. Try reconnecting Notion." };
  }

  const data = (await res.json()) as NotionDatabaseSchema;
  const properties = data.properties ?? {};
  const issues: string[] = [];

  for (const req of REQUIRED_PROPERTIES) {
    const prop = properties[req.name];
    if (!prop) {
      issues.push(`Add a "${req.name}" property (${req.label})`);
      continue;
    }
    if (prop.type !== req.type) {
      issues.push(`"${req.name}" must be ${req.label} (currently ${prop.type})`);
    }
  }

  const misnamedTitle = Object.entries(properties).find(
    ([name, prop]) => prop.type === "title" && name !== "Name",
  );
  if (misnamedTitle && issues.some((issue) => issue.includes('"Name"'))) {
    issues.push(`Rename your title property "${misnamedTitle[0]}" to "Name"`);
  }

  if (issues.length === 0) return { ok: true };

  return {
    ok: false,
    message: `This database is missing required properties. In Notion, add or fix:\n\n• ${issues.join("\n• ")}`,
  };
}

export async function completeNotionSetup(userId: string, accessTokenEncrypted: string, dbId: string, env: Env): Promise<void> {
  const db = createDb(env.DB);
  await notionIntegrations.upsert(db, { userId, databaseId: dbId, accessTokenEncrypted });
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
