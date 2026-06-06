export interface Profile {
  id: string;
  username: string;
  requireSenderMatch: boolean;
  mcpTokenHash: string | null;
  createdAt: number;
  notion: {
    databaseId: string;
    accessTokenEncrypted: string;
  } | null;
}

export interface Env {
  DB: D1Database;
  NOTES_BUCKET: R2Bucket;
  MCP_TOKEN_KV: KVNamespace;
  USER_INDEX_KV: KVNamespace;
  PROFILE_KV: KVNamespace;
  NOTION_TOKEN_KV: KVNamespace;
  EPHEMERAL_KV: KVNamespace;
  RESEND_API_KEY: SecretsStoreSecret;
  ENCRYPTION_KEY: SecretsStoreSecret;
  NOTION_CLIENT_SECRET: SecretsStoreSecret;
  NOTION_CLIENT_ID: string;
  EMAIL_DOMAIN: string;
  APP_URL: string;
  DISPLAY_PIN_IN_CONSOLE: string | boolean;
}

export interface ParsedEmail {
  subject: string;
  body: string;
}

export interface Note {
  timestamp: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  emlKey?: string;
}
