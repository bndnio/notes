import installMcpScript from "@/templates/install-mcp.txt";
import { renderTemplate, text } from "@/lib/responses";
import type { Env } from "@/lib/types";

export function handleMcpInstall(env: Env): Response {
  return text(renderTemplate(installMcpScript, { appUrl: env.APP_URL }));
}
