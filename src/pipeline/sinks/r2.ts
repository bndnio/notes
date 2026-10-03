import { createDb } from "@/db";
import * as notesRepo from "@/db/repositories/notes";
import { noteKeys } from "@/lib/platform-storage";
import type { Content } from "@/lib/types";
import type { Sink, SinkContext, SinkResult } from "./types";

// A line break in a value could end the frontmatter block early or inject fields.
function frontmatterValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

function toMarkdown(content: Content, emlKey?: string): string {
  return `---
timestamp: ${frontmatterValue(content.timestamp)}
from: ${frontmatterValue(content.from)}
to: ${frontmatterValue(content.to)}
subject: ${frontmatterValue(content.subject)}
${emlKey ? `emlKey: ${emlKey}` : ""}
---

${content.body || "(empty)"}
`;
}

export const r2Sink: Sink = {
  id: "r2",
  enabled: (profile) => profile.storageEnabled,

  async write(content: Content, ctx: SinkContext): Promise<SinkResult> {
    try {
      const noteId = notesRepo.generateNoteId();
      const { mdKey, emlKey } = noteKeys(ctx.profile.id, noteId, content.subject, content.timestamp);
      const stored: Content = {
        ...content,
        subject: content.subject || "(no subject)",
      };
      const rawEmail = ctx.artifacts?.rawEmail;

      const saveEml = rawEmail
        ? ctx.env.NOTES_BUCKET.put(emlKey, rawEmail, {
            httpMetadata: { contentType: "message/rfc822" },
          })
        : Promise.resolve();

      const saveMd = ctx.env.NOTES_BUCKET.put(mdKey, toMarkdown(stored, rawEmail ? emlKey : undefined), {
        httpMetadata: { contentType: "text/markdown" },
      });

      const [emlResult, mdResult] = await Promise.allSettled([saveEml, saveMd]);

      if (rawEmail) {
        if (emlResult.status === "rejected") console.error(`R2 eml write failed: ${emlResult.reason}`);
        else console.log(`Saved eml: ${emlKey}`);
      }

      if (mdResult.status === "rejected") {
        const error = String(mdResult.reason);
        console.error(`R2 md write failed: ${error}`);
        return { ok: false, error };
      }

      console.log(`Saved md: ${mdKey}`);

      // The note is already saved, so an index failure is logged rather than failing the write.
      try {
        await notesRepo.create(createDb(ctx.env.DB), {
          id: noteId,
          userId: ctx.profile.id,
          r2Key: mdKey,
          emailKey: rawEmail && emlResult.status === "fulfilled" ? emlKey : null,
          subject: frontmatterValue(stored.subject),
          from: frontmatterValue(stored.from),
          createdAt: Date.parse(stored.timestamp),
        });
      } catch (e) {
        console.error(`Notes index write failed for ${mdKey}: ${e instanceof Error ? e.message : String(e)}`);
      }

      return { ok: true, detail: mdKey };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`R2 write failed: ${error}`);
      return { ok: false, error };
    }
  },
};
