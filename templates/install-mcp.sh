#!/bin/sh
set -e
if [ -z "$NOTES_MCP_TOKEN" ]; then
  echo "Error: NOTES_MCP_TOKEN is not set."
  echo "  export NOTES_MCP_TOKEN=your_token_here"
  exit 1
fi
claude mcp add --transport http notes https://notes.bndn.io/mcp \
  -H "Authorization: Bearer ${NOTES_MCP_TOKEN}"
echo "Done. Restart Claude Code to activate the notes MCP server."
