import { describe, expect, it } from "vitest";

import {
  generateSessionToken,
  getSessionCookieOptions,
  getSessionExpiration,
  hashSessionToken,
  SESSION_DURATION_SECONDS,
} from "@/server/auth/session-token";

describe("session token security", () => {
  it("creates unique opaque tokens and deterministic hashes", () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(43);
    expect(hashSessionToken(first)).toHaveLength(64);
    expect(hashSessionToken(first)).toBe(hashSessionToken(first));
    expect(hashSessionToken(first)).not.toContain(first);
  });

  it("uses a reasonable expiration", () => {
    const now = new Date("2026-09-30T00:00:00.000Z");
    expect(getSessionExpiration(now).getTime() - now.getTime()).toBe(
      SESSION_DURATION_SECONDS * 1_000,
    );
  });

  it("uses HttpOnly SameSite cookies", () => {
    const cookie = getSessionCookieOptions();
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.path).toBe("/");
  });
});
