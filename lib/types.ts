export interface Profile {
  username: string;
  notionDbId: string;
  notionToken: (env: Env) => string;
}

export interface Env {
  NOTES_BUCKET: R2Bucket;
  MCP_AUTH_TOKEN: string;
  MCP_DEFAULT_USERNAME: string;
  SENDER_KV: KVNamespace;
  NOTION_TOKEN_BRENDON: string;
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
