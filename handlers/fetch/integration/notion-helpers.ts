import notionSetupHtml from "../../../templates/notion-setup.html";
import { fetchNotion } from "../../../lib/destinations/notion";
import { encrypt } from "../../../lib/crypto";
import { lookupProfile } from "../../../lib/profiles";
import { resolveNotionSecrets } from "../../../lib/tokens";
import { html, renderTemplate } from "../../../lib/responses";
import type { Env, NotionSecrets } from "../../../lib/types";

export interface NotionDatabase {
  id: string;
  title: string;
}

interface NotionSearchResponse {
  results: Array<{
    id: string;
    title?: Array<{ plain_text?: string }>;
  }>;
}

export async function completeNotionSetup(userId: string, accessToken: string, dbId: string, env: Env): Promise<void> {
  const [encryptionKey, profile] = await Promise.all([
    env.ENCRYPTION_KEY.get(),
    lookupProfile(env.PROFILE_KV, userId),
  ]);
  if (!profile) throw new Error(`No profile for userId: ${userId}`);

  const existing = await resolveNotionSecrets(userId, env);
  const updated: NotionSecrets = { clientSecret: existing?.clientSecret ?? "", accessToken };
  const encrypted = await encrypt(JSON.stringify(updated), encryptionKey);

  await Promise.all([
    env.NOTION_TOKEN_KV.put(userId, encrypted),
    env.PROFILE_KV.put(userId, JSON.stringify({ ...profile, notionDbId: dbId })),
  ]);
}

export function renderNotionSetup(state: string, env: Env, error = ""): Response {
  return html(renderTemplate(notionSetupHtml, { state, appUrl: env.APP_URL, error }));
}

export async function listDatabases(accessToken: string): Promise<NotionDatabase[]> {
  const res = await fetchNotion("/search", accessToken, {
    method: "POST",
    body: JSON.stringify({ filter: { value: "database", property: "object" } }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as NotionSearchResponse;
  return data.results.map((db) => ({
    id: db.id,
    title: db.title?.[0]?.plain_text ?? "(untitled)",
  }));
}

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
