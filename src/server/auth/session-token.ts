import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "winter_arc_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionExpiration(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_DURATION_SECONDS * 1_000);
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };
}
