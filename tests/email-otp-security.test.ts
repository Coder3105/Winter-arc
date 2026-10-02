import { describe, expect, it } from "vitest";

import {
  generateOtpCode,
  generateOtpRequestId,
  hashOtp,
  opaqueSubjectHash,
  verifyOtpHash,
} from "@/server/auth/otp-crypto";
import {
  AUTH_EMAIL_SUBJECTS,
  createGuildInviteEmail,
  createLoginOtpEmail,
  createRegistrationOtpEmail,
} from "@/server/email/templates/auth-emails";
import {
  requestEmailOtpSchema,
  verifyLoginOtpSchema,
  verifyRegistrationOtpSchema,
} from "@/lib/validation/auth";

const pepper = "synthetic-test-pepper-that-is-long-enough";
const identity = {
  purpose: "LOGIN" as const,
  requestId: "a".repeat(43),
  emailNormalized: "user@example.test",
};

describe("V2.2 OTP cryptography and validation", () => {
  it("generates fixed-width numeric codes, including leading-zero capacity", () => {
    const codes = Array.from({ length: 128 }, generateOtpCode);
    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
  });

  it("generates unpredictable-format request IDs", () => {
    const first = generateOtpRequestId();
    const second = generateOtpRequestId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("binds the HMAC to purpose, request, normalized email, and code", () => {
    const digest = hashOtp(identity, "012345", pepper);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyOtpHash(identity, "012345", digest, pepper)).toBe(true);
    expect(verifyOtpHash(identity, "012346", digest, pepper)).toBe(false);
    expect(hashOtp({ ...identity, purpose: "REGISTER" }, "012345", pepper)).not.toBe(
      digest,
    );
    expect(
      hashOtp({ ...identity, emailNormalized: "other@example.test" }, "012345", pepper),
    ).not.toBe(digest);
    expect(
      hashOtp({ ...identity, requestId: "b".repeat(43) }, "012345", pepper),
    ).not.toBe(digest);
  });

  it("hashes rate-limit identities without retaining their raw value", () => {
    const digest = opaqueSubjectHash("OTP_IP_REQUEST", "203.0.113.2", pepper);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain("203.0.113.2");
  });

  it("accepts only normalized email requests and exact six-digit verification codes", () => {
    expect(requestEmailOtpSchema.parse({ email: " User@Example.Test " })).toEqual({
      email: "user@example.test",
    });
    expect(
      verifyLoginOtpSchema.safeParse({
        email: "user@example.test",
        requestId: "a".repeat(43),
        otp: "012345",
      }).success,
    ).toBe(true);
    expect(
      verifyLoginOtpSchema.safeParse({
        email: "user@example.test",
        requestId: "a".repeat(43),
        otp: "12345",
      }).success,
    ).toBe(false);
  });

  it("requires the established 12-character registration password policy", () => {
    expect(
      verifyRegistrationOtpSchema.safeParse({
        email: "user@example.test",
        requestId: "a".repeat(43),
        otp: "123456",
        password: "too-short",
      }).success,
    ).toBe(false);
  });
});

describe("V2.2 authentication email templates", () => {
  it("uses three exact, distinct subjects without putting a code in a subject", () => {
    const subjects = Object.values(AUTH_EMAIL_SUBJECTS);
    expect(new Set(subjects).size).toBe(3);
    expect(AUTH_EMAIL_SUBJECTS).toEqual({
      registration: "Winter Arc — Verify Your Email",
      login: "Winter Arc — Login Request",
      guildInvite: "Winter Arc — Guild Invitation",
    });
    expect(subjects.join(" ")).not.toMatch(/\d{6}/);
  });

  it("renders materially distinct registration and login HTML plus text fallbacks", () => {
    const registration = createRegistrationOtpEmail({
      to: "user@example.test",
      otp: "012345",
      expiresInMinutes: 10,
    });
    const login = createLoginOtpEmail({
      to: "user@example.test",
      otp: "012345",
      expiresInMinutes: 10,
    });
    expect(registration.html).toContain("IDENTITY INITIALIZATION");
    expect(login.html).toContain("SECURE ACCESS");
    expect(registration.html).not.toBe(login.html);
    expect(registration.html).toContain("012345");
    expect(registration.text).toContain("012345");
    expect(registration.subject).not.toContain("012345");
    expect(registration.html).toContain("max-width:560px");
    expect(`${registration.html} ${registration.text}`).not.toMatch(
      /\d+\s*kg|body composition|daily quest|no fap/i,
    );
  });

  it("escapes an untrusted guild inviter and keeps the code out of the subject", () => {
    const invitation = createGuildInviteEmail({
      to: "user@example.test",
      inviterDisplayName: '<img src=x onerror="alert(1)">',
      otp: "012345",
      expiresInMinutes: 10,
    });
    expect(invitation.html).toContain("&lt;img");
    expect(invitation.html).not.toContain("<img src=x");
    expect(invitation.html).not.toContain("href=");
    expect(invitation.text).toContain("012345");
    expect(invitation.subject).not.toContain("012345");
    expect(invitation.text).toContain(
      "If you approve this connection, give this code to",
    );
    expect(invitation.text).toContain(
      "They must enter it from their outgoing Guild request",
    );
  });
});
