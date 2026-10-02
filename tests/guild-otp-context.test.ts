import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { hashOtp, verifyOtpHash } from "@/server/auth/otp-crypto";

const pepper = "synthetic-pepper";
const requestId = "r".repeat(43);

describe("V2.4 Guild OTP context isolation", () => {
  it("preserves the legacy REGISTER and LOGIN hash payload", () => {
    const identity = {
      purpose: "REGISTER" as const,
      requestId,
      emailNormalized: "user@example.test",
    };
    const expected = createHmac("sha256", pepper)
      .update(`REGISTER:${requestId}:user@example.test:012345`)
      .digest("hex");
    expect(hashOtp(identity, "012345", pepper)).toBe(expected);
  });

  it("prevents one invite code from validating another invite", () => {
    const first = {
      purpose: "GUILD_INVITE" as const,
      requestId,
      emailNormalized: "user@example.test",
      contextKey: "invite-a",
    };
    const second = { ...first, contextKey: "invite-b" };
    const hash = hashOtp(first, "012345", pepper);
    expect(verifyOtpHash(first, "012345", hash, pepper)).toBe(true);
    expect(verifyOtpHash(second, "012345", hash, pepper)).toBe(false);
  });
});
