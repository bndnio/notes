import betaBannerHtml from "../templates/beta-banner.html";

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

export function pageVars(vars: Record<string, string> = {}): Record<string, string> {
  return { betaBanner: betaBannerHtml, ...vars };
}

export const html = (content: string) =>
  new Response(content, { headers: { "Content-Type": "text/html; charset=utf-8" } });

export const text = (content: string) =>
  new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

export const css = (content: string) =>
  new Response(content, { headers: { "Content-Type": "text/css; charset=utf-8" } });
