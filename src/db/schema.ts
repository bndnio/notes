import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  requireSenderMatch: integer("require_sender_match", { mode: "boolean" }).notNull().default(true),
  storageEnabled: integer("storage_enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const userEmails = sqliteTable("user_emails", {
  email: text("email").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
});

export const notionIntegrations = sqliteTable("notion_integrations", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  databaseId: text("database_id").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const mcpTokens = sqliteTable("mcp_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
}, (t) => [uniqueIndex("mcp_tokens_user_id_name_unique").on(t.userId, t.name)]);

export const usersRelations = relations(users, ({ one, many }) => ({
  notion: one(notionIntegrations, {
    fields: [users.id],
    references: [notionIntegrations.userId],
  }),
  emails: many(userEmails),
  mcpTokens: many(mcpTokens),
}));

export const userEmailsRelations = relations(userEmails, ({ one }) => ({
  user: one(users, { fields: [userEmails.userId], references: [users.id] }),
}));

export const notionIntegrationsRelations = relations(notionIntegrations, ({ one }) => ({
  user: one(users, { fields: [notionIntegrations.userId], references: [users.id] }),
}));

export const mcpTokensRelations = relations(mcpTokens, ({ one }) => ({
  user: one(users, { fields: [mcpTokens.userId], references: [users.id] }),
}));
