import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  inviteInit: vi.fn(),
  inviteUpdateMany: vi.fn(),
  inviteExists: vi.fn(),
  inviteCreate: vi.fn(),
  inviteDeleteOne: vi.fn(),
  inviteUpdateOne: vi.fn(),
  inviteFindOne: vi.fn(),
  inviteFindOneAndUpdate: vi.fn(),
  ownerFindOne: vi.fn(),
  ownerFindById: vi.fn(),
  otpUpdateOne: vi.fn(),
  requestOtp: vi.fn(),
  consumeOtp: vi.fn(),
  consumedOtp: vi.fn(),
  getConnection: vi.fn(),
  activateConnection: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/models/guild-invite", () => ({
  GuildInviteModel: {
    init: mocks.inviteInit,
    updateMany: mocks.inviteUpdateMany,
    exists: mocks.inviteExists,
    create: mocks.inviteCreate,
    deleteOne: mocks.inviteDeleteOne,
    updateOne: mocks.inviteUpdateOne,
    findOne: mocks.inviteFindOne,
    findOneAndUpdate: mocks.inviteFindOneAndUpdate,
  },
}));
vi.mock("@/server/models/owner", () => ({
  OwnerModel: {
    findOne: mocks.ownerFindOne,
    findById: mocks.ownerFindById,
  },
}));
vi.mock("@/server/models/email-otp", () => ({
  EmailOtpModel: { updateOne: mocks.otpUpdateOne },
}));
vi.mock("@/server/auth/email-otp-service", () => ({
  requestGuildInviteOtp: mocks.requestOtp,
  consumeGuildInviteOtp: mocks.consumeOtp,
  isGuildInviteOtpConsumed: mocks.consumedOtp,
}));
vi.mock("@/server/services/guild-connection-service", () => ({
  getGuildConnection: mocks.getConnection,
  activateGuildConnection: mocks.activateConnection,
}));

import { AppError } from "@/server/errors/app-error";
import {
  acceptGuildInvite,
  declineGuildInvite,
  resendGuildInviteOtp,
  sendGuildInvite,
} from "@/server/services/guild-invite-service";

const now = new Date("2026-10-01T08:00:00.000Z");
const inviter = {
  id: "64b000000000000000000001",
  email: "owner@example.test",
  displayName: "Owner",
};
const target = {
  id: "64b000000000000000000002",
  email: "friend@example.test",
  displayName: "Friend",
};
const inviterAccount = {
  _id: inviter.id,
  email: inviter.email,
  emailNormalized: inviter.email,
  emailVerifiedAt: now,
  displayName: inviter.displayName,
  status: "ACTIVE",
  isActive: true,
};
const targetAccount = {
  _id: target.id,
  email: target.email,
  emailNormalized: target.email,
  emailVerifiedAt: now,
  displayName: target.displayName,
  status: "ACTIVE",
  isActive: true,
};

function invite(status: "PENDING" | "ACCEPTED" = "PENDING") {
  return {
    _id: "64b000000000000000000003",
    inviterUserId: inviter.id,
    inviteeEmailNormalized: target.email,
    inviteeUserId: target.id,
    status,
    expiresAt: new Date("2026-10-08T08:00:00.000Z"),
    otpRequestId: "r".repeat(43),
    acceptedAt: status === "ACCEPTED" ? now : null,
    declinedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("V2.4 Guild invitation service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue({});
    mocks.inviteInit.mockResolvedValue(undefined);
    mocks.inviteUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    mocks.inviteExists.mockResolvedValue(null);
    mocks.inviteCreate.mockResolvedValue(invite());
    mocks.inviteDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mocks.inviteUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.otpUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.requestOtp.mockResolvedValue({
      requestId: "r".repeat(43),
      expiresInSeconds: 600,
      resendAvailableInSeconds: 60,
      message: "Guild verification code sent to the existing account.",
    });
    mocks.consumeOtp.mockResolvedValue(undefined);
    mocks.consumedOtp.mockResolvedValue(false);
    mocks.getConnection.mockResolvedValue(null);
    mocks.activateConnection.mockResolvedValue({ status: "ACTIVE" });
  });

  it("rejects self-invites before database or email work", async () => {
    await expect(
      sendGuildInvite(inviter, " OWNER@EXAMPLE.TEST ", "203.0.113.1", { now }),
    ).rejects.toMatchObject({ code: "CANNOT_INVITE_SELF" });
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.requestOtp).not.toHaveBeenCalled();
  });

  it("sends a contextual code only to an existing active account", async () => {
    mocks.ownerFindOne
      .mockResolvedValueOnce(inviterAccount)
      .mockResolvedValueOnce(targetAccount);
    const result = await sendGuildInvite(inviter, target.email, "203.0.113.1", { now });
    expect(result).toEqual({
      inviteId: "64b000000000000000000003",
      message: "Guild verification code sent to the existing account.",
      expiresAt: "2026-10-08T08:00:00.000Z",
      verification: { requestId: "r".repeat(43) },
    });
    expect(mocks.inviteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        inviterUserId: inviter.id,
        inviteeEmailNormalized: target.email,
        inviteeUserId: target.id,
        status: "PENDING",
      }),
    );
    expect(mocks.requestOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: target.email,
        contextKey: "64b000000000000000000003",
        inviterUserId: inviter.id,
      }),
      { now },
    );
  });

  it("rejects an email without an active account before creating or sending", async () => {
    mocks.ownerFindOne.mockResolvedValueOnce(inviterAccount).mockResolvedValueOnce(null);
    await expect(
      sendGuildInvite(inviter, target.email, "203.0.113.1", { now }),
    ).rejects.toMatchObject({ code: "GUILD_ACCOUNT_NOT_FOUND" });
    expect(mocks.inviteCreate).not.toHaveBeenCalled();
    expect(mocks.requestOtp).not.toHaveBeenCalled();
  });

  it("rejects duplicate and reciprocal pending requests", async () => {
    mocks.ownerFindOne
      .mockResolvedValueOnce(inviterAccount)
      .mockResolvedValueOnce(targetAccount);
    mocks.inviteExists.mockResolvedValueOnce({ _id: "reciprocal" });
    await expect(
      sendGuildInvite(inviter, target.email, "203.0.113.1", { now }),
    ).rejects.toMatchObject({ code: "GUILD_INVITE_PENDING" });
    expect(mocks.inviteCreate).not.toHaveBeenCalled();

    vi.resetAllMocks();
    mocks.connect.mockResolvedValue({});
    mocks.inviteInit.mockResolvedValue(undefined);
    mocks.inviteUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    mocks.ownerFindOne
      .mockResolvedValueOnce(inviterAccount)
      .mockResolvedValueOnce(targetAccount);
    mocks.inviteExists.mockResolvedValueOnce({ _id: "same-direction" });
    await expect(
      sendGuildInvite(inviter, target.email, "203.0.113.1", { now }),
    ).rejects.toMatchObject({ code: "GUILD_INVITE_PENDING" });
  });

  it("does not leave a pending invite when email delivery fails", async () => {
    mocks.ownerFindOne
      .mockResolvedValueOnce(inviterAccount)
      .mockResolvedValueOnce(targetAccount);
    mocks.requestOtp.mockRejectedValue(new AppError("EMAIL_DELIVERY_FAILED"));
    await expect(
      sendGuildInvite(inviter, target.email, "203.0.113.1", { now }),
    ).rejects.toMatchObject({ code: "EMAIL_DELIVERY_FAILED" });
    expect(mocks.inviteDeleteOne).toHaveBeenCalledWith({
      _id: "64b000000000000000000003",
      status: "PENDING",
    });
  });

  it("does not allow the recipient to submit the outgoing verification", async () => {
    mocks.ownerFindOne.mockResolvedValueOnce(targetAccount);
    mocks.inviteFindOne.mockResolvedValueOnce(null);
    await expect(
      acceptGuildInvite(
        target,
        "64b000000000000000000003",
        { requestId: "r".repeat(43), otp: "012345" },
        "203.0.113.1",
        { now },
      ),
    ).rejects.toMatchObject({ code: "GUILD_INVITE_NOT_FOUND" });
    expect(mocks.consumeOtp).not.toHaveBeenCalled();
  });

  it("lets only the inviter resend a code to the existing target account", async () => {
    mocks.ownerFindOne
      .mockResolvedValueOnce(inviterAccount)
      .mockResolvedValueOnce(targetAccount);
    mocks.inviteFindOne.mockResolvedValue(invite());
    mocks.ownerFindById.mockResolvedValue(inviterAccount);
    await resendGuildInviteOtp(inviter, "64b000000000000000000003", "203.0.113.1", {
      now,
    });
    expect(mocks.requestOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: target.email,
        inviterUserId: inviter.id,
      }),
      { now },
    );
  });

  it("expires a pending invitation before accepting it", async () => {
    mocks.ownerFindOne.mockResolvedValue(inviterAccount);
    mocks.inviteFindOne.mockResolvedValue({
      ...invite(),
      expiresAt: new Date(now.getTime() - 1),
    });
    await expect(
      acceptGuildInvite(
        inviter,
        "64b000000000000000000003",
        { requestId: "r".repeat(43), otp: "012345" },
        "203.0.113.1",
        { now },
      ),
    ).rejects.toMatchObject({ code: "GUILD_INVITE_EXPIRED" });
    expect(mocks.inviteUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING" }),
      { $set: { status: "EXPIRED" } },
    );
  });

  it("converges a consumed concurrent acceptance on one active connection", async () => {
    mocks.ownerFindOne
      .mockResolvedValueOnce(inviterAccount)
      .mockResolvedValueOnce(targetAccount);
    mocks.inviteFindOne.mockResolvedValue(invite());
    mocks.consumeOtp.mockRejectedValue(new AppError("OTP_INVALID"));
    mocks.consumedOtp.mockResolvedValue(true);
    const result = await acceptGuildInvite(
      inviter,
      "64b000000000000000000003",
      { requestId: "r".repeat(43), otp: "012345" },
      "203.0.113.1",
      { now },
    );
    expect(result).toEqual({ memberId: target.id, status: "ACTIVE" });
    expect(mocks.activateConnection).toHaveBeenCalledExactlyOnceWith(
      inviter.id,
      target.id,
      now,
    );
    expect(mocks.inviteUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "64b000000000000000000003" }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "ACCEPTED" }) }),
    );
  });

  it("lets only the incoming authenticated account decline", async () => {
    mocks.ownerFindOne.mockResolvedValue(targetAccount);
    mocks.inviteFindOne.mockResolvedValue(invite());
    mocks.inviteFindOneAndUpdate.mockResolvedValue({
      ...invite(),
      status: "DECLINED",
    });
    await expect(
      declineGuildInvite(target, "64b000000000000000000003", now),
    ).resolves.toEqual({
      id: "64b000000000000000000003",
      status: "DECLINED",
    });
    expect(mocks.otpUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "GUILD_INVITE",
        contextKey: "64b000000000000000000003",
      }),
      { $set: { status: "INVALIDATED" } },
    );
  });
});
