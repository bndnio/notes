#!/bin/sh
# Notes MCP server installer for Claude Code
set -e
if [ -z "$NOTES_MCP_TOKEN" ]; then
  echo "Error: NOTES_MCP_TOKEN is not set."
  echo "  export NOTES_MCP_TOKEN=your_token_here"
  echo "This script configures the Notes MCP server for Claude Code only."
  exit 1
fi
claude mcp remove notes 2>/dev/null || true
claude mcp add --transport http notes {{appUrl}}/mcp \
  -H "Authorization: Bearer ${NOTES_MCP_TOKEN}"
echo "Done. Restart Claude Code to activate the Notes MCP server."
