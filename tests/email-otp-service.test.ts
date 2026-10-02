import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  ownerExists: vi.fn(),
  ownerFindOne: vi.fn(),
  ownerFindOneAndUpdate: vi.fn(),
  ownerUpdateOne: vi.fn(),
  otpInit: vi.fn(),
  otpFindOne: vi.fn(),
  otpFindOneAndUpdate: vi.fn(),
  otpUpdateOne: vi.fn(),
  otpExists: vi.fn(),
  createVerified: vi.fn(),
  environment: vi.fn(),
  createTransport: vi.fn(),
  gmailSend: vi.fn(),
  resendConstructor: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/models/owner", () => ({
  OwnerModel: {
    exists: mocks.ownerExists,
    findOne: mocks.ownerFindOne,
    findOneAndUpdate: mocks.ownerFindOneAndUpdate,
    updateOne: mocks.ownerUpdateOne,
  },
}));
vi.mock("@/server/models/email-otp", () => ({
  EmailOtpModel: {
    init: mocks.otpInit,
    findOne: mocks.otpFindOne,
    findOneAndUpdate: mocks.otpFindOneAndUpdate,
    updateOne: mocks.otpUpdateOne,
    exists: mocks.otpExists,
  },
}));
vi.mock("@/server/services/user-account-service", () => ({
  createVerifiedUserAccount: mocks.createVerified,
}));
vi.mock("@/lib/env/server", () => ({ getServerEnvironment: mocks.environment }));
vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));
vi.mock("resend", () => ({
  Resend: class {
    readonly emails = { send: vi.fn() };

    constructor(apiKey: string) {
      mocks.resendConstructor(apiKey);
    }
  },
}));

import {
  consumeGuildInviteOtp,
  requestGuildInviteOtp,
  requestLoginOtp,
  requestRegistrationOtp,
  verifyLoginOtp,
  verifyRegistrationOtp,
} from "@/server/auth/email-otp-service";
import { hashOtp } from "@/server/auth/otp-crypto";
import { createEmailProvider, type EmailProvider } from "@/server/email/email-provider";

const now = new Date("2026-10-01T08:00:00.000Z");
const pepper = "synthetic-test-pepper-that-is-long-enough";
const requestId = "r".repeat(43);
const rateLimit = vi.fn().mockResolvedValue(undefined);

function dependencies(
  provider: EmailProvider = { send: vi.fn().mockResolvedValue(undefined) },
) {
  return { now, pepper, provider, rateLimit };
}

function verificationRecord(purpose: "REGISTER" | "LOGIN", otp = "012345") {
  return {
    _id: "otp-id",
    emailNormalized: "user@example.test",
    purpose,
    requestId,
    otpHash: hashOtp(
      { purpose, requestId, emailNormalized: "user@example.test" },
      otp,
      pepper,
    ),
    status: "SENT",
    expiresAt: new Date(now.getTime() + 60_000),
    attemptCount: 0,
    maxAttempts: 5,
  };
}

describe("V2.2 email OTP service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.mockResolvedValue(undefined);
    mocks.connect.mockResolvedValue({});
    mocks.otpInit.mockResolvedValue(undefined);
    mocks.ownerExists.mockResolvedValue(null);
    mocks.otpFindOneAndUpdate.mockResolvedValue({ _id: "otp-id" });
    mocks.otpUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.environment.mockReturnValue({
      EMAIL_PROVIDER: "gmail",
      GMAIL_USER: "mailer@example.test",
      GMAIL_APP_PASSWORD: "synthetic-app-password",
      EMAIL_FROM: "Winter Arc <system@example.test>",
    });
    mocks.gmailSend.mockResolvedValue({
      accepted: ["user@example.test"],
      rejected: [],
    });
    mocks.createTransport.mockReturnValue({ sendMail: mocks.gmailSend });
    mocks.createVerified.mockResolvedValue({
      id: "new-user",
      email: "user@example.test",
      displayName: "Hunter",
    });
  });

  it("issues registration email only after persisting a hashed PENDING_SEND record", async () => {
    const provider = createEmailProvider();
    const response = await requestRegistrationOtp(
      " User@Example.Test ",
      "203.0.113.1",
      dependencies(provider),
    );

    expect(response.requestId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mocks.gmailSend).toHaveBeenCalledOnce();
    const email = mocks.gmailSend.mock.calls[0]![0];
    expect(email.subject).toBe("Winter Arc — Verify Your Email");
    expect(email.html).toContain("IDENTITY INITIALIZATION");
    const code = email.text.match(/\b\d{6}\b/)?.[0];
    expect(code).toMatch(/^\d{6}$/);
    const update = mocks.otpFindOneAndUpdate.mock.calls[0]![1];
    expect(update.$set.status).toBe("PENDING_SEND");
    expect(update.$set.otpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(update)).not.toContain(code);
    expect(mocks.otpUpdateOne).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: response.requestId, status: "PENDING_SEND" }),
      { $set: { status: "SENT" } },
    );
  });

  it("invalidates a pending record and reports delivery failure when the provider rejects", async () => {
    const provider = {
      send: vi.fn().mockRejectedValue(new Error("private provider error")),
    };
    await expect(
      requestRegistrationOtp("user@example.test", "203.0.113.1", dependencies(provider)),
    ).rejects.toMatchObject({ code: "EMAIL_DELIVERY_FAILED" });
    expect(mocks.otpUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING_SEND" }),
      { $set: { status: "INVALIDATED" } },
    );
  });

  it("maps a concurrent unique-key resend race to the cooldown error", async () => {
    mocks.otpFindOneAndUpdate.mockRejectedValue({ code: 11000 });
    await expect(
      requestRegistrationOtp("user@example.test", "203.0.113.1", dependencies()),
    ).rejects.toMatchObject({ code: "OTP_RESEND_COOLDOWN" });
  });

  it("replaces the old request identity with a fresh request after cooldown", async () => {
    const provider = { send: vi.fn().mockResolvedValue(undefined) };
    const first = await requestRegistrationOtp(
      "user@example.test",
      "203.0.113.1",
      dependencies(provider),
    );
    const second = await requestRegistrationOtp("user@example.test", "203.0.113.1", {
      ...dependencies(provider),
      now: new Date(now.getTime() + 61_000),
    });
    expect(second.requestId).not.toBe(first.requestId);
    expect(mocks.otpFindOneAndUpdate.mock.calls[1]![1].$set.requestId).toBe(
      second.requestId,
    );
  });

  it("refuses registration for every existing normalized account", async () => {
    mocks.ownerExists.mockResolvedValue({ _id: "existing" });
    await expect(
      requestRegistrationOtp("user@example.test", "203.0.113.1", dependencies()),
    ).rejects.toMatchObject({ code: "ACCOUNT_ALREADY_EXISTS" });
    expect(mocks.otpFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns the same generic login request shape without sending for ineligible accounts", async () => {
    const provider = { send: vi.fn().mockResolvedValue(undefined) };
    const response = await requestLoginOtp(
      "missing@example.test",
      "203.0.113.1",
      dependencies(provider),
    );
    expect(response).toMatchObject({
      expiresInSeconds: 600,
      resendAvailableInSeconds: 60,
      message: expect.stringContaining("eligible"),
    });
    expect(response.requestId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(provider.send).not.toHaveBeenCalled();
    expect(mocks.otpFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("sends an eligible login OTP through the selected Gmail provider", async () => {
    mocks.ownerExists.mockResolvedValue({ _id: "active-owner" });
    await requestLoginOtp(
      "user@example.test",
      "203.0.113.1",
      dependencies(createEmailProvider()),
    );

    expect(mocks.gmailSend).toHaveBeenCalledOnce();
    expect(mocks.gmailSend.mock.calls[0]![0]).toMatchObject({
      to: "user@example.test",
      subject: "Winter Arc — Login Request",
      html: expect.stringContaining("SECURE ACCESS"),
      text: expect.stringMatching(/\b\d{6}\b/),
    });
    expect(mocks.resendConstructor).not.toHaveBeenCalled();
  });

  it("invalidates an eligible login code when its provider send fails", async () => {
    mocks.ownerExists.mockResolvedValue({ _id: "active-owner" });
    const provider = { send: vi.fn().mockRejectedValue(new Error("private failure")) };
    await expect(
      requestLoginOtp("user@example.test", "203.0.113.1", dependencies(provider)),
    ).rejects.toMatchObject({ code: "EMAIL_DELIVERY_FAILED" });
    expect(mocks.otpUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "LOGIN", status: "PENDING_SEND" }),
      { $set: { status: "INVALIDATED" } },
    );
  });

  it("consumes a valid registration code once before creating an active identity", async () => {
    const record = verificationRecord("REGISTER");
    mocks.otpFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue(record) });
    mocks.otpFindOneAndUpdate.mockResolvedValue(record);
    await expect(
      verifyRegistrationOtp(
        {
          email: "user@example.test",
          requestId,
          otp: "012345",
          password: "synthetic-password",
          clientAddress: "203.0.113.1",
        },
        { now, pepper, rateLimit },
      ),
    ).resolves.toMatchObject({ id: "new-user" });
    expect(mocks.otpFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SENT", otpHash: record.otpHash }),
      { $set: { status: "CONSUMED", consumedAt: now } },
      { new: true },
    );
    expect(mocks.createVerified).toHaveBeenCalledWith({
      email: "user@example.test",
      password: "synthetic-password",
      emailVerifiedAt: now,
    });
  });

  it("counts a wrong code without creating an account", async () => {
    const record = verificationRecord("REGISTER");
    mocks.otpFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue(record) });
    await expect(
      verifyRegistrationOtp(
        {
          email: "user@example.test",
          requestId,
          otp: "999999",
          password: "synthetic-password",
          clientAddress: "203.0.113.1",
        },
        { now, pepper, rateLimit },
      ),
    ).rejects.toMatchObject({ code: "OTP_INVALID" });
    expect(mocks.otpUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "otp-id", status: "SENT" }),
      { $inc: { attemptCount: 1 } },
    );
    expect(mocks.createVerified).not.toHaveBeenCalled();
  });

  it("binds registration lookup to normalized email, purpose, and request ID", async () => {
    mocks.otpFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
    await expect(
      verifyRegistrationOtp(
        {
          email: "Other@Example.test",
          requestId,
          otp: "012345",
          password: "synthetic-password",
          clientAddress: "203.0.113.1",
        },
        { now, pepper, rateLimit },
      ),
    ).rejects.toMatchObject({ code: "OTP_INVALID" });
    expect(mocks.otpFindOne).toHaveBeenCalledWith({
      emailNormalized: "other@example.test",
      purpose: "REGISTER",
      contextKey: null,
      requestId,
    });
  });

  it("issues Guild codes under invite-specific contexts with Guild rate limits", async () => {
    const provider = createEmailProvider();
    const response = await requestGuildInviteOtp(
      {
        email: "Friend@Example.test",
        contextKey: "invite-a",
        inviterUserId: "owner-a",
        inviterDisplayName: "Hunter A",
        clientAddress: "203.0.113.1",
      },
      dependencies(provider),
    );
    expect(response.message).toBe(
      "Guild verification code sent to the existing account.",
    );
    expect(mocks.gmailSend).toHaveBeenCalledOnce();
    expect(mocks.gmailSend.mock.calls[0]![0]).toMatchObject({
      to: "friend@example.test",
      subject: "Winter Arc — Guild Invitation",
      html: expect.stringContaining("GUILD REQUEST"),
      text: expect.stringMatching(/\b\d{6}\b/),
    });
    expect(mocks.resendConstructor).not.toHaveBeenCalled();
    expect(mocks.otpFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        emailNormalized: "friend@example.test",
        purpose: "GUILD_INVITE",
        contextKey: "invite-a",
      }),
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ contextKey: "invite-a" }),
      }),
      expect.any(Object),
    );
    expect(rateLimit.mock.calls.map(([input]) => input.scope)).toEqual([
      "GUILD_INVITER_SEND",
      "GUILD_TARGET_SEND",
      "OTP_IP_REQUEST",
    ]);
  });

  it("binds Guild verification to the exact invitation context", async () => {
    const guildIdentity = {
      purpose: "GUILD_INVITE" as const,
      requestId,
      emailNormalized: "user@example.test",
      contextKey: "invite-a",
    };
    const record = {
      ...verificationRecord("LOGIN"),
      ...guildIdentity,
      otpHash: hashOtp(guildIdentity, "012345", pepper),
    };
    mocks.otpFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue(record) });
    mocks.otpFindOneAndUpdate.mockResolvedValue(record);
    await consumeGuildInviteOtp(
      {
        email: "user@example.test",
        contextKey: "invite-a",
        requestId,
        otp: "012345",
        clientAddress: "203.0.113.1",
      },
      { now, pepper, rateLimit },
    );
    expect(mocks.otpFindOne).toHaveBeenCalledWith({
      emailNormalized: "user@example.test",
      purpose: "GUILD_INVITE",
      contextKey: "invite-a",
      requestId,
    });
  });

  it("allows only one winner when valid registration verifications race", async () => {
    const record = verificationRecord("REGISTER");
    mocks.otpFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue(record) });
    mocks.otpFindOneAndUpdate.mockResolvedValueOnce(record).mockResolvedValueOnce(null);
    const input = {
      email: "user@example.test",
      requestId,
      otp: "012345",
      password: "synthetic-password",
      clientAddress: "203.0.113.1",
    };
    const results = await Promise.allSettled([
      verifyRegistrationOtp(input, { now, pepper, rateLimit }),
      verifyRegistrationOtp(input, { now, pepper, rateLimit }),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(mocks.createVerified).toHaveBeenCalledTimes(1);
  });

  it("rejects expired, pending-send, consumed, and exhausted codes identically", async () => {
    for (const patch of [
      { expiresAt: new Date(now.getTime() - 1) },
      { status: "PENDING_SEND" },
      { status: "CONSUMED" },
      { attemptCount: 5 },
    ]) {
      const record = { ...verificationRecord("REGISTER"), ...patch };
      mocks.otpFindOne.mockReturnValueOnce({ select: vi.fn().mockResolvedValue(record) });
      await expect(
        verifyRegistrationOtp(
          {
            email: "user@example.test",
            requestId,
            otp: "012345",
            password: "synthetic-password",
            clientAddress: "203.0.113.1",
          },
          { now, pepper, rateLimit },
        ),
      ).rejects.toMatchObject({ code: "OTP_INVALID" });
    }
  });

  it("marks an active account verified on successful OTP login without exposing secrets", async () => {
    const owner = {
      _id: "owner-id",
      email: "user@example.test",
      displayName: "Hunter",
      emailVerifiedAt: null,
    };
    const record = verificationRecord("LOGIN");
    mocks.ownerFindOne.mockResolvedValue(owner);
    mocks.otpFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue(record) });
    mocks.otpFindOneAndUpdate.mockResolvedValue(record);
    mocks.ownerFindOneAndUpdate.mockResolvedValue(owner);
    mocks.ownerUpdateOne.mockResolvedValue({ modifiedCount: 1 });

    const result = await verifyLoginOtp(
      {
        email: "user@example.test",
        requestId,
        otp: "012345",
        clientAddress: "203.0.113.1",
      },
      { now, pepper, rateLimit },
    );
    expect(result).toEqual({
      id: "owner-id",
      email: "user@example.test",
      displayName: "Hunter",
    });
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("otpHash");
    expect(mocks.ownerUpdateOne).toHaveBeenCalledWith(
      { _id: "owner-id", emailVerifiedAt: null },
      { $set: { emailVerifiedAt: now } },
    );
  });
});
