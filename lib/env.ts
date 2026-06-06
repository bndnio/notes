import type { Env } from "./types";

export function isLocalDev(env: Env): boolean {
  try {
    const host = new URL(env.APP_URL).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}
