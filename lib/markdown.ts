import type { Note } from "./types";

export function toMarkdown(note: Note): string {
  return `---
timestamp: ${note.timestamp}
from: ${note.from}
to: ${note.to}
subject: ${note.subject}
${note.emlKey ? `emlKey: ${note.emlKey}` : ""}
---

${note.body || "(empty)"}
`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}
