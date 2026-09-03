export async function fetchNotion(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      ...notionHeaders(token),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

function notionHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  };
}
