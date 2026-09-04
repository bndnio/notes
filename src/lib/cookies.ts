export function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split("; ")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return null;
}

export function getCookie(request: Request, name: string): string | null {
  return parseCookieValue(request.headers.get("Cookie"), name);
}
