import { describe, test, expect } from "bun:test";
import { resolveTheme } from "../src/lib/theme";

function withCookie(cookie?: string): Request {
  return new Request("https://notes.bndn.io/", cookie ? { headers: { Cookie: cookie } } : {});
}

describe("resolveTheme", () => {
  test("returns a known theme from the cookie", () => {
    expect(resolveTheme(withCookie("theme=paper"))).toBe("paper");
    expect(resolveTheme(withCookie("session=abc; theme=ink"))).toBe("ink");
  });

  test("falls back to auto when the cookie is missing", () => {
    expect(resolveTheme(withCookie())).toBe("auto");
    expect(resolveTheme(withCookie("session=abc"))).toBe("auto");
  });

  test("rejects unknown or tampered values", () => {
    expect(resolveTheme(withCookie("theme=auto"))).toBe("auto");
    expect(resolveTheme(withCookie("theme=Ink"))).toBe("auto");
    expect(resolveTheme(withCookie("theme=blueprint"))).toBe("auto");
    expect(resolveTheme(withCookie('theme=ink"><script>alert(1)</script>'))).toBe("auto");
    expect(resolveTheme(withCookie("theme="))).toBe("auto");
  });
});
