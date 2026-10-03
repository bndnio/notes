export interface Profile {
  id: string;
  username: string;
  requireSenderMatch: boolean;
  storageEnabled: boolean;
  createdAt: number;
  notion: {
    databaseId: string;
    accessTokenEncrypted: string;
  } | null;
}

export interface McpTokenSummary {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface NoteSummary {
  id: string;
  subject: string;
  from: string;
  createdAt: number;
  emailKey: string | null;
}

/** Profile page fragment contributed by one integration. Composed by routes/ui/profile.ts. */
export interface Section {
  card: string;
  modal: string;
  script: string;
}

export interface Env {
  DB: D1Database;
  NOTES_BUCKET: R2Bucket;
  EPHEMERAL_KV: KVNamespace;
  SEC_RESEND_API_KEY: string;
  SEC_ENCRYPTION_KEY: string;
  SEC_NOTION_CLIENT_SECRET: string;
  NOTION_CLIENT_ID: string;
  EMAIL_DOMAIN: string;
  APP_URL: string;
}

export interface ParsedEmail {
  subject: string;
  body: string;
}

export interface Content {
  timestamp: string;
  from: string;
  to: string;
  subject: string;
  body: string;
}
