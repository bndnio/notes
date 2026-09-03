import type { Content } from "./types";

export function toMarkdown(content: Content, emlKey?: string): string {
  return `---
timestamp: ${content.timestamp}
from: ${content.from}
to: ${content.to}
subject: ${content.subject}
${emlKey ? `emlKey: ${emlKey}` : ""}
---

${content.body || "(empty)"}
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
