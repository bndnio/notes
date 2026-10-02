import notionSelectModalHtml from "@/templates/components/notion/select-modal.html";
import notionScriptHtml from "@/templates/components/notion/script.html";
import { escHtml } from "@/lib/html";
import { renderTemplate, renderIntegrationCard } from "@/lib/responses";
import * as notionKv from "@/kv/repositories/notion";
import type { Env, Profile, Section } from "@/lib/types";

function buildNotionModal(
  databases: Array<{ id: string; title: string }>,
  csrfField: string,
  schemaError?: string | null,
  selectedDbId?: string,
): string {
  const databaseOptions = databases
    .map(
      (db) =>
        `<label class="checkbox-label">` +
        `<input type="radio" name="dbId" value="${escHtml(db.id)}" required${db.id === selectedDbId ? " checked" : ""}> ` +
        `${escHtml(db.title)}</label>`,
    )
    .join("\n");
  const schemaErrorSection = schemaError
    ? `<div class="warning">${escHtml(schemaError).replace(/\n/g, "<br>")}</div>`
    : "";
  return renderTemplate(notionSelectModalHtml, { databases: databaseOptions, csrfField, schemaError: schemaErrorSection });
}

function notionSelectButton(variant: "primary" | "ghost", text: string): string {
  const classes = variant === "primary" ? "btn btn--red" : "btn btn--ghost btn--sm";
  return `<button type="button" class="${classes}" onclick="openNotionModal()">${text} →</button>`;
}

export async function buildNotionSection(
  profile: Profile,
  userId: string,
  env: Env,
  csrfField: string,
): Promise<Section> {
  const script = notionScriptHtml;

  const [databases, schemaError, pendingToken] = await Promise.all([
    notionKv.findDatabases(userId),
    notionKv.findSchemaError(userId),
    notionKv.findToken(userId),
  ]);
  const modal = databases?.length
    ? buildNotionModal(databases, csrfField, schemaError, profile.notion?.databaseId)
    : "";

  if (profile.notion?.databaseId) {
    return {
      card: renderIntegrationCard({
        name: "Notion",
        badgeClass: "status-badge--connected",
        badgeText: "Connected",
        description: "Notes are being saved to your Notion database.",
        action: notionSelectButton("ghost", "Change database"),
      }),
      modal,
      script,
    };
  }

  if (databases?.length || pendingToken) {
    return {
      card: renderIntegrationCard({
        name: "Notion",
        badgeClass: "status-badge--pending",
        badgeText: "Pending",
        description: "Notion is authorized — choose which database to save notes to.",
        action: notionSelectButton("primary", "Select database"),
      }),
      modal,
      script,
    };
  }

  return {
    card: renderIntegrationCard({
      name: "Notion",
      badgeClass: "status-badge--none",
      badgeText: "Not connected",
      description: "Connect Notion to save notes to your workspace.",
      action: `<button id="notion-connect-btn" class="btn btn--red" onclick="openNotionPopup()">Connect →</button>`,
    }),
    modal: "",
    script,
  };
}
