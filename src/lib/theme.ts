import { getCookie } from "./cookies";

export const THEME_COOKIE = "theme";

const THEMES = ["paper", "ink"] as const;
export type Theme = (typeof THEMES)[number] | "auto";

// The cookie is visitor-controlled and lands in an HTML attribute, so only
// known values pass; anything else (missing, tampered) falls back to "auto",
// which follows the OS light/dark setting.
export function resolveTheme(request: Request): Theme {
  const value = getCookie(request, THEME_COOKIE);
  return THEMES.find((t) => t === value) ?? "auto";
}
