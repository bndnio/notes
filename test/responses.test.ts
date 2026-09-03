import { describe, expect, test } from "bun:test";
import { html } from "../lib/responses";

describe("html response helper", () => {
  test("adds baseline security headers to HTML responses", () => {
    const res = html("<p>ok</p>");

    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Content-Security-Policy")).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Permissions-Policy")).toBe("geolocation=(), microphone=(), camera=()");
  });
});
