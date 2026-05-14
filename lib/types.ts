export interface Env {
  NOTES_BUCKET: R2Bucket;
  ALLOWED_SENDER: string;
  NOTION_TOKEN: string;
  NOTION_DB_ID: string;
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
  raw_key: string;
}
