export interface Env {
  NOTES_BUCKET: R2Bucket;
  ALLOWED_SENDER: string;
  NOTION_TOKEN: string;
  NOTION_DB_ID: string;
  MCP_AUTH_TOKEN: string;
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
