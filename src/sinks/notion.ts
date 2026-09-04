import { decrypt } from "../lib/crypto";
import type { Sink, SinkContext, SinkResult } from "./types";
import type { Content } from "../lib/types";
import { fetchNotion } from "../lib/notion-client";

function toNotionPage(content: Content, databaseId: string) {
  const subject = content.subject || "(no subject)";
  return {
    parent: { database_id: databaseId },
    properties: {
      Name: {
        title: [{ text: { content: subject } }],
      },
      Date: {
        date: { start: content.timestamp },
      },
      From: {
        rich_text: [{ text: { content: content.from } }],
      },
    },
    children: chunkBody(content.body).map((chunk) => ({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: chunk } }],
      },
    })),
  };
}

async function postToNotion(content: Content, notionToken: string, notionDbId: string): Promise<void> {
  const res = await fetchNotion("/pages", notionToken, {
    method: "POST",
    body: JSON.stringify(toNotionPage(content, notionDbId)),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error ${res.status}: ${err}`);
  }
}

function chunkBody(text: string, size = 1900): string[] {
  if (!text) return ["(empty)"];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export const notionSink: Sink = {
  id: "notion",
  enabled: (profile) => profile.notion !== null,

  async write(content: Content, ctx: SinkContext): Promise<SinkResult> {
    const notion = ctx.profile.notion;
    if (!notion) return { ok: false, error: "not configured" };
    try {
      const token = await decrypt(notion.accessTokenEncrypted, ctx.env.SEC_ENCRYPTION_KEY);
      await postToNotion(content, token, notion.databaseId);
      console.log("Saved to Notion");
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`Notion write failed: ${error}`);
      return { ok: false, error };
    }
  },
};
