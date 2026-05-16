export const html = (content: string) =>
  new Response(content, { headers: { "Content-Type": "text/html; charset=utf-8" } });

export const text = (content: string) =>
  new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

export const css = (content: string) =>
  new Response(content, { headers: { "Content-Type": "text/css; charset=utf-8" } });
