import "server-only";

import { maskEmail, normalizeEmail } from "@/lib/auth/email";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import { GUILD_INVITE_TTL_SECONDS } from "@/server/guild/guild-policy";
import {
  consumeGuildInviteOtp,
  isGuildInviteOtpConsumed,
  requestGuildInviteOtp,
  type OtpServiceDependencies,
} from "@/server/auth/email-otp-service";
import { ACTIVE_ACCOUNT_FILTER } from "@/server/auth/account-status";
import type { AuthenticatedUser } from "@/server/auth/auth-service";
import { EmailOtpModel } from "@/server/models/email-otp";
import { GuildInviteModel, type GuildInviteDocument } from "@/server/models/guild-invite";
import { OwnerModel, type OwnerDocument } from "@/server/models/owner";

import { activateGuildConnection, getGuildConnection } from "./guild-connection-service";

export interface GuildInviteServiceDependencies extends OtpServiceDependencies {
  readonly now?: Date;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === 11000
  );
}

function contextKey(invite: GuildInviteDocument): string {
  return invite._id.toString();
}

async function expirePendingInvites(filter: Record<string, unknown>, now: Date) {
  await GuildInviteModel.updateMany(
    { ...filter, status: "PENDING", expiresAt: { $lte: now } },
    { $set: { status: "EXPIRED" } },
  );
}

async function accountForSession(user: AuthenticatedUser): Promise<OwnerDocument> {
  const account = await OwnerModel.findOne({
    _id: user.id,
    emailNormalized: normalizeEmail(user.email),
    ...ACTIVE_ACCOUNT_FILTER,
  });
  if (!account) throw new AppError("UNAUTHORIZED");
  return account;
}

function activeAccountByEmail(emailNormalized: string) {
  return {
    $and: [
      ACTIVE_ACCOUNT_FILTER,
      {
        $or: [
          { emailNormalized },
          { emailNormalized: { $exists: false }, email: emailNormalized },
        ],
      },
    ],
  };
}

async function recipientInvite(user: AuthenticatedUser, inviteId: string, now: Date) {
  const account = await accountForSession(user);
  const invite = await GuildInviteModel.findOne({
    _id: inviteId,
    inviteeEmailNormalized: account.emailNormalized,
    $or: [{ inviteeUserId: account._id }, { inviteeUserId: null }],
  });
  if (!invite) throw new AppError("GUILD_INVITE_NOT_FOUND");
  if (!invite.inviteeUserId) {
    await GuildInviteModel.updateOne(
      { _id: invite._id, inviteeUserId: null },
      { $set: { inviteeUserId: account._id } },
    );
    invite.inviteeUserId = account._id;
  }
  if (invite.status === "PENDING" && invite.expiresAt.getTime() <= now.getTime()) {
    await GuildInviteModel.updateOne(
      { _id: invite._id, status: "PENDING" },
      { $set: { status: "EXPIRED" } },
    );
    throw new AppError("GUILD_INVITE_EXPIRED");
  }
  return { account, invite };
}

async function inviterInvite(user: AuthenticatedUser, inviteId: string, now: Date) {
  const account = await accountForSession(user);
  const invite = await GuildInviteModel.findOne({
    _id: inviteId,
    inviterUserId: account._id,
  });
  if (!invite) throw new AppError("GUILD_INVITE_NOT_FOUND");
  if (invite.status === "PENDING" && invite.expiresAt.getTime() <= now.getTime()) {
    await GuildInviteModel.updateOne(
      { _id: invite._id, status: "PENDING" },
      { $set: { status: "EXPIRED" } },
    );
    throw new AppError("GUILD_INVITE_EXPIRED");
  }
  return { account, invite };
}

async function inviteeAccountForInvite(invite: GuildInviteDocument) {
  const identity = invite.inviteeUserId ? { _id: invite.inviteeUserId } : {};
  const account = await OwnerModel.findOne({
    $and: [activeAccountByEmail(invite.inviteeEmailNormalized), identity],
  });
  if (!account) throw new AppError("GUILD_ACCOUNT_NOT_FOUND");
  return account;
}

export async function sendGuildInvite(
  inviter: AuthenticatedUser,
  targetEmail: string,
  clientAddress: string,
  dependencies: GuildInviteServiceDependencies = {},
) {
  const now = dependencies.now ?? new Date();
  const inviteeEmailNormalized = normalizeEmail(targetEmail);
  const inviterEmailNormalized = normalizeEmail(inviter.email);
  if (inviteeEmailNormalized === inviterEmailNormalized) {
    throw new AppError("CANNOT_INVITE_SELF");
  }
  await connectToDatabase();
  await GuildInviteModel.init();
  const inviterAccount = await accountForSession(inviter);
  const inviteeAccount = await OwnerModel.findOne(
    activeAccountByEmail(inviteeEmailNormalized),
  );
  if (!inviteeAccount) throw new AppError("GUILD_ACCOUNT_NOT_FOUND");

  const connection = await getGuildConnection(
    inviterAccount._id.toString(),
    inviteeAccount._id.toString(),
  );
  if (connection?.status === "ACTIVE") throw new AppError("GUILD_ALREADY_CONNECTED");
  if (connection?.status === "BLOCKED") throw new AppError("GUILD_BLOCKED");
  await expirePendingInvites(
    {
      inviterUserId: inviteeAccount._id,
      $or: [
        { inviteeUserId: inviterAccount._id },
        { inviteeEmailNormalized: inviterEmailNormalized },
      ],
    },
    now,
  );
  if (
    await GuildInviteModel.exists({
      inviterUserId: inviteeAccount._id,
      status: "PENDING",
      $or: [
        { inviteeUserId: inviterAccount._id },
        { inviteeEmailNormalized: inviterEmailNormalized },
      ],
    })
  ) {
    throw new AppError("GUILD_INVITE_PENDING");
  }

  await expirePendingInvites(
    { inviterUserId: inviterAccount._id, inviteeEmailNormalized },
    now,
  );
  if (
    await GuildInviteModel.exists({
      inviterUserId: inviterAccount._id,
      inviteeEmailNormalized,
      status: "PENDING",
    })
  ) {
    throw new AppError("GUILD_INVITE_PENDING");
  }

  let invite: GuildInviteDocument;
  try {
    invite = await GuildInviteModel.create({
      inviterUserId: inviterAccount._id,
      inviteeEmailNormalized,
      inviteeUserId: inviteeAccount._id,
      status: "PENDING",
      expiresAt: new Date(now.getTime() + GUILD_INVITE_TTL_SECONDS * 1_000),
      otpRequestId: null,
      acceptedAt: null,
      declinedAt: null,
      cancelledAt: null,
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError("GUILD_INVITE_PENDING");
    throw error;
  }

  try {
    const verification = await requestGuildInviteOtp(
      {
        email: inviteeEmailNormalized,
        contextKey: contextKey(invite),
        inviterUserId: inviterAccount._id.toString(),
        inviterDisplayName: inviterAccount.displayName,
        clientAddress,
      },
      dependencies,
    );
    const updated = await GuildInviteModel.updateOne(
      { _id: invite._id, status: "PENDING" },
      { $set: { otpRequestId: verification.requestId } },
    );
    if (updated.modifiedCount !== 1) {
      await EmailOtpModel.updateOne(
        {
          purpose: "GUILD_INVITE",
          contextKey: contextKey(invite),
          requestId: verification.requestId,
        },
        { $set: { status: "INVALIDATED" } },
      );
      throw new AppError("INTERNAL_ERROR");
    }
    return {
      inviteId: invite._id.toString(),
      message: verification.message,
      expiresAt: invite.expiresAt.toISOString(),
      verification: { requestId: verification.requestId },
    } as const;
  } catch (error) {
    await GuildInviteModel.deleteOne({ _id: invite._id, status: "PENDING" });
    throw error;
  }
}

export async function listGuildInvites(user: AuthenticatedUser, now = new Date()) {
  await connectToDatabase();
  const account = await accountForSession(user);
  await GuildInviteModel.updateMany(
    {
      inviteeEmailNormalized: account.emailNormalized,
      inviteeUserId: null,
      status: "PENDING",
    },
    { $set: { inviteeUserId: account._id } },
  );
  const authority = {
    $or: [
      { inviterUserId: account._id },
      { inviteeUserId: account._id },
      { inviteeEmailNormalized: account.emailNormalized },
    ],
  };
  await expirePendingInvites(authority, now);
  const [incoming, outgoing] = await Promise.all([
    GuildInviteModel.find({
      status: "PENDING",
      $or: [
        { inviteeUserId: account._id },
        { inviteeEmailNormalized: account.emailNormalized },
      ],
    }).sort({ createdAt: -1, _id: -1 }),
    GuildInviteModel.find({
      inviterUserId: account._id,
      status: "PENDING",
    }).sort({ createdAt: -1, _id: -1 }),
  ]);
  const inviterIds = [...new Set(incoming.map((item) => item.inviterUserId.toString()))];
  const inviters = await OwnerModel.find({ _id: { $in: inviterIds } });
  const byId = new Map(inviters.map((item) => [item._id.toString(), item]));
  return {
    incoming: incoming.map((invite) => ({
      id: invite._id.toString(),
      status: invite.status,
      inviter: {
        displayName: byId.get(invite.inviterUserId.toString())?.displayName ?? "HUNTER",
        avatarKey: null,
      },
      createdAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
    })),
    outgoing: outgoing.map((invite) => ({
      id: invite._id.toString(),
      status: invite.status,
      targetEmailMasked: maskEmail(invite.inviteeEmailNormalized),
      verification: { requestId: invite.otpRequestId },
      createdAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
    })),
  } as const;
}

export async function resendGuildInviteOtp(
  user: AuthenticatedUser,
  inviteId: string,
  clientAddress: string,
  dependencies: GuildInviteServiceDependencies = {},
) {
  const now = dependencies.now ?? new Date();
  const { invite } = await inviterInvite(user, inviteId, now);
  if (invite.status !== "PENDING") throw new AppError("GUILD_INVITE_NOT_FOUND");
  const inviter = await OwnerModel.findById(invite.inviterUserId);
  if (!inviter) throw new AppError("GUILD_INVITE_NOT_FOUND");
  const invitee = await inviteeAccountForInvite(invite);
  const verification = await requestGuildInviteOtp(
    {
      email: invitee.emailNormalized,
      contextKey: contextKey(invite),
      inviterUserId: inviter._id.toString(),
      inviterDisplayName: inviter.displayName,
      clientAddress,
    },
    dependencies,
  );
  await GuildInviteModel.updateOne(
    { _id: invite._id, status: "PENDING" },
    { $set: { otpRequestId: verification.requestId } },
  );
  return verification;
}

export async function acceptGuildInvite(
  user: AuthenticatedUser,
  inviteId: string,
  input: { readonly requestId: string; readonly otp: string },
  clientAddress: string,
  dependencies: GuildInviteServiceDependencies = {},
) {
  const now = dependencies.now ?? new Date();
  const { account: inviter, invite } = await inviterInvite(user, inviteId, now);
  const invitee = await inviteeAccountForInvite(invite);
  const inviteeId = invitee._id.toString();
  if (invite.status === "ACCEPTED") {
    const active = await getGuildConnection(inviter._id.toString(), inviteeId);
    if (active?.status === "ACTIVE") {
      return { memberId: inviteeId, status: "ACTIVE" as const };
    }
  }
  if (invite.status !== "PENDING") throw new AppError("GUILD_INVITE_NOT_FOUND");
  if (!invite.otpRequestId || invite.otpRequestId !== input.requestId) {
    throw new AppError("OTP_INVALID");
  }

  try {
    await consumeGuildInviteOtp(
      {
        email: invitee.emailNormalized,
        contextKey: contextKey(invite),
        requestId: input.requestId,
        otp: input.otp,
        clientAddress,
      },
      dependencies,
    );
  } catch (error) {
    const consumed =
      error instanceof AppError &&
      error.code === "OTP_INVALID" &&
      (await isGuildInviteOtpConsumed({
        email: invitee.emailNormalized,
        contextKey: contextKey(invite),
        requestId: input.requestId,
      }));
    if (!consumed) throw error;
  }

  const connection = await activateGuildConnection(
    inviter._id.toString(),
    inviteeId,
    now,
  );
  await GuildInviteModel.updateOne(
    { _id: invite._id, status: { $in: ["PENDING", "ACCEPTED"] } },
    {
      $set: {
        status: "ACCEPTED",
        acceptedAt: invite.acceptedAt ?? now,
        inviteeUserId: invitee._id,
      },
    },
  );
  return { memberId: inviteeId, status: connection.status } as const;
}

export async function declineGuildInvite(
  user: AuthenticatedUser,
  inviteId: string,
  now = new Date(),
) {
  const { invite } = await recipientInvite(user, inviteId, now);
  const updated = await GuildInviteModel.findOneAndUpdate(
    { _id: invite._id, status: "PENDING" },
    { $set: { status: "DECLINED", declinedAt: now } },
    { new: true },
  );
  if (!updated) throw new AppError("GUILD_INVITE_NOT_FOUND");
  await EmailOtpModel.updateOne(
    { purpose: "GUILD_INVITE", contextKey: contextKey(invite) },
    { $set: { status: "INVALIDATED" } },
  );
  return { id: inviteId, status: updated.status } as const;
}

export async function cancelGuildInvite(
  user: AuthenticatedUser,
  inviteId: string,
  now = new Date(),
) {
  await connectToDatabase();
  const updated = await GuildInviteModel.findOneAndUpdate(
    { _id: inviteId, inviterUserId: user.id, status: "PENDING" },
    { $set: { status: "CANCELLED", cancelledAt: now } },
    { new: true },
  );
  if (!updated) throw new AppError("GUILD_INVITE_NOT_FOUND");
  await EmailOtpModel.updateOne(
    { purpose: "GUILD_INVITE", contextKey: contextKey(updated) },
    { $set: { status: "INVALIDATED" } },
  );
  return { id: inviteId, status: updated.status } as const;
}
