export interface Profile {
  userId: string;
  username: string;
  notionDbId: string;
}

export interface Env {
  NOTES_BUCKET: R2Bucket;
  MCP_TOKEN_KV: KVNamespace;
  USER_INDEX_KV: KVNamespace;
  PROFILE_KV: KVNamespace;
  NOTION_TOKEN_KV: KVNamespace;
  ENCRYPTION_KEY: SecretsStoreSecret;
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
