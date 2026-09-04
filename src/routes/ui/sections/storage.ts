import storageCardHtml from "@/templates/storage-card.html";
import storageModalHtml from "@/templates/storage-modal.html";
import storageNoteListItemHtml from "@/templates/storage-note-list-item.html";
import storageScriptHtml from "@/templates/storage-script.html";
import { escHtml } from "@/lib/html";
import { listStoredNotes } from "@/lib/platform-storage";
import { renderTemplate } from "@/lib/responses";
import type { Env, Profile, Section } from "@/lib/types";

export async function buildStorageSection(
  profile: Profile,
  userId: string,
  env: Env,
  csrfField: string,
): Promise<Section> {
  const enabled = profile.storageEnabled;
  const notes = enabled ? await listStoredNotes(env.NOTES_BUCKET, userId) : [];
  const hasNotes = notes.length > 0;
  const noteListItems = notes
    .map((note) =>
      renderTemplate(storageNoteListItemHtml, {
        subject: escHtml(note.subject),
        date: escHtml(note.date),
      }))
    .join("\n");

  return {
    card: renderTemplate(storageCardHtml, {
      enabledHidden: enabled ? "" : "hidden",
      disabledHidden: enabled ? "hidden" : "",
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
