import mcpSetupModalHtml from "@/templates/components/mcp/setup-modal.html";
import mcpManageModalHtml from "@/templates/components/mcp/manage-modal.html";
import mcpTokenRowHtml from "@/templates/components/mcp/token-row.html";
import mcpPendingHtml from "@/templates/components/mcp/pending.html";
import mcpScriptHtml from "@/templates/components/mcp/script.html";
import { decrypt } from "@/lib/crypto";
import { escHtml } from "@/lib/html";
import { renderTemplate, renderIntegrationCard } from "@/lib/responses";
import { createDb } from "@/db";
import * as mcpTokensRepo from "@/db/repositories/mcp-tokens";
import * as mcpTokensKv from "@/kv/repositories/mcp-tokens";
import type { Env, McpTokenSummary, Section } from "@/lib/types";

// Dates render in UTC; the worker has no viewer timezone to work with.
function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function buildTokenRow(token: McpTokenSummary, csrfField: string): string {
  return renderTemplate(mcpTokenRowHtml, {
    csrfField,
    id: escHtml(token.id),
    name: escHtml(token.name),
    maxNameLength: String(mcpTokensRepo.MAX_TOKEN_NAME_LENGTH),
    createdIso: new Date(token.createdAt).toISOString(),
    createdDate: formatDate(token.createdAt),
    lastUsed: token.lastUsedAt === null ? "never" : formatDate(token.lastUsedAt),
  });
}

function buildManageModal(
  tokens: McpTokenSummary[],
  pendingName: string | null,
  csrfField: string,
): string {
  const atLimit = tokens.length >= mcpTokensRepo.MAX_TOKENS_PER_USER;
  const pendingSection = pendingName
    ? renderTemplate(mcpPendingHtml, { tokenName: escHtml(pendingName), csrfField })
    : "";

  return renderTemplate(mcpManageModalHtml, {
    csrfField,
    pendingSection,
    tokenList: tokens.map((t) => buildTokenRow(t, csrfField)).join("\n"),
    tokenCount: String(tokens.length),
    maxTokens: String(mcpTokensRepo.MAX_TOKENS_PER_USER),
    maxNameLength: String(mcpTokensRepo.MAX_TOKEN_NAME_LENGTH),
    emptyHidden: tokens.length > 0 ? "hidden" : "",
    // One token is staged at a time; finish or discard it before starting another.
    createHidden: pendingName || atLimit ? "hidden" : "",
    limitHidden: atLimit ? "" : "hidden",
  });
}

export async function buildMcpSection(
  userId: string,
  env: Env,
  encryptionKey: string,
  csrfField: string,
): Promise<Section> {
  const [tokens, pending] = await Promise.all([
    mcpTokensRepo.findAllByUserId(createDb(env.DB), userId),
    mcpTokensKv.find(userId),
  ]);

  let badgeClass: string;
  let badgeText: string;
  if (tokens.length > 0) {
    badgeClass = "status-badge--connected";
    badgeText = tokens.length === 1 ? "1 token" : `${tokens.length} tokens`;
  } else if (pending) {
    badgeClass = "status-badge--pending";
    badgeText = "Pending";
  } else {
    badgeClass = "status-badge--none";
    badgeText = "Not set up";
  }

  const setupModal = pending
    ? renderTemplate(mcpSetupModalHtml, {
        csrfField,
        tokenName: escHtml(pending.name),
        mcpToken: escHtml(await decrypt(pending.encrypted, encryptionKey)),
        appUrl: env.APP_URL,
      })
    : "";

  const card = renderIntegrationCard({
    name: "MCP Server",
    badgeClass,
    badgeText,
    description: "Connect Notes to Claude Code as an AI tool.",
    action: `<button type="button" class="btn btn--ghost" onclick="openMcpModal('mcp-manage')">Manage →</button>`,
  });

  return {
    card,
    modal: setupModal + buildManageModal(tokens, pending?.name ?? null, csrfField),
    script: mcpScriptHtml,
  };
}
