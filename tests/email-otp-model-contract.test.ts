import { describe, expect, it } from "vitest";

import { AuthRateLimitModel } from "@/server/models/auth-rate-limit";
import { EmailOtpModel } from "@/server/models/email-otp";

describe("V2.2 OTP persistence models", () => {
  it("enforces one current request per normalized email, purpose, and context", () => {
    expect(EmailOtpModel.schema.indexes()).toContainEqual([
      { emailNormalized: 1, purpose: 1, contextKey: 1 },
      expect.objectContaining({ unique: true, name: "unique_email_otp_context" }),
    ]);
    expect(EmailOtpModel.schema.indexes()).toContainEqual([
      { requestId: 1 },
      expect.objectContaining({ unique: true, name: "unique_email_otp_request" }),
    ]);
  });

  it("uses explicit expiration TTL and keeps the OTP hash hidden by default", () => {
    expect(EmailOtpModel.schema.indexes()).toContainEqual([
      { expiresAt: 1 },
      expect.objectContaining({ expireAfterSeconds: 0, name: "email_otp_expiration" }),
    ]);
    expect(EmailOtpModel.schema.path("otpHash").options.select).toBe(false);
    expect(EmailOtpModel.schema.path("contextKey")).toBeDefined();
    expect(EmailOtpModel.schema.path("otp")).toBeUndefined();
  });

  it("enforces unique distributed limiter windows with automatic cleanup", () => {
    expect(AuthRateLimitModel.schema.indexes()).toContainEqual([
      { scope: 1, subjectHash: 1, windowStartedAt: 1 },
      expect.objectContaining({ unique: true, name: "unique_auth_rate_window" }),
    ]);
    expect(AuthRateLimitModel.schema.indexes()).toContainEqual([
      { expiresAt: 1 },
      expect.objectContaining({ expireAfterSeconds: 0 }),
    ]);
    expect(AuthRateLimitModel.schema.path("email")).toBeUndefined();
    expect(AuthRateLimitModel.schema.path("ipAddress")).toBeUndefined();
  });
});
