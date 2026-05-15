import type { Note } from "./types";

export async function postToNotion(note: Note, notionToken: string, notionDbId: string): Promise<void> {
  const body = {
    parent: { database_id: notionDbId },
    properties: {
      Name: {
        title: [{ text: { content: note.subject } }],
      },
      Date: {
        date: { start: note.timestamp },
      },
      From: {
        rich_text: [{ text: { content: note.from } }],
      },
    },
    children: chunkBody(note.body).map((chunk) => ({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: chunk } }],
      },
    })),
  };

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify(body),
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
