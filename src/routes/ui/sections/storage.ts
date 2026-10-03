import storageCardHtml from "@/templates/components/storage/card.html";
import storageModalHtml from "@/templates/components/storage/modal.html";
import storageNoteListItemHtml from "@/templates/components/storage/note-list-item.html";
import storageScriptHtml from "@/templates/components/storage/script.html";
import { escHtml } from "@/lib/html";
import { renderTemplate } from "@/lib/responses";
import { createDb } from "@/db";
import * as notesRepo from "@/db/repositories/notes";
import type { Env, Profile, Section } from "@/lib/types";

export async function buildStorageSection(
  profile: Profile,
  userId: string,
  env: Env,
  csrfField: string,
): Promise<Section> {
  const enabled = profile.storageEnabled;
  const notes = enabled ? await notesRepo.findRecent(createDb(env.DB), userId) : [];
  const hasNotes = notes.length > 0;
  const noteListItems = notes
    .map((note) =>
      renderTemplate(storageNoteListItemHtml, {
        subject: escHtml(note.subject),
        date: new Date(note.createdAt).toISOString().slice(0, 10),
      }))
    .join("\n");

  return {
    card: renderTemplate(storageCardHtml, {
      enabledHidden: enabled ? "" : "hidden",
      disabledHidden: enabled ? "hidden" : "",
      viewNotesHidden: hasNotes ? "" : "hidden",
    }),
    modal: renderTemplate(storageModalHtml, {
      csrfField,
      storageEnabledChecked: enabled ? "checked" : "",
      storageEnabledAttr: enabled ? "true" : "false",
      noteListHidden: enabled && hasNotes ? "" : "hidden",
      noteListItems,
      emptyListHidden: enabled && !hasNotes ? "" : "hidden",
      storageHintHidden: enabled ? "hidden" : "",
    }),
    script: storageScriptHtml,
  };
}
