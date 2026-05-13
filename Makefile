deploy:
	bunx wrangler deploy

dev:
	bunx wrangler dev

typecheck:
	bunx tsc --noEmit

logs:
	bunx wrangler tail

secret-sender:
	bunx wrangler secret put ALLOWED_SENDER

secret-notion-token:
	bunx wrangler secret put NOTION_TOKEN

secret-notion-db:
	bunx wrangler secret put NOTION_DB_ID

bucket:
	bunx wrangler r2 bucket create bndn-notes
