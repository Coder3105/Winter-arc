import "server-only";

import type { Types } from "mongoose";

import { connectToDatabase } from "@/server/db/mongoose";
import { AuthSessionModel } from "@/server/models/auth-session";
import { OwnerModel } from "@/server/models/owner";
import { normalizeEmail } from "@/lib/auth/email";
import { ACTIVE_ACCOUNT_FILTER } from "./account-status";

import { verifyPassword } from "./password";
import {
  generateSessionToken,
  getSessionExpiration,
  hashSessionToken,
} from "./session-token";

const DUMMY_PASSWORD_HASH =
  "$2b$12$PMmO3vFeSCloBE4n1rZFmugXZNO3sLzWXSZ2vSvk3xe.aYaBWhtvm";

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}
export type AuthenticatedOwner = AuthenticatedUser;

export interface CreatedSession {
  readonly token: string;
  readonly expiresAt: Date;
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<AuthenticatedOwner | null> {
  await connectToDatabase();
  const owner = await OwnerModel.findOne({
    $and: [
      ACTIVE_ACCOUNT_FILTER,
      {
        $or: [
          { emailNormalized: normalizeEmail(email) },
          { emailNormalized: { $exists: false }, email: normalizeEmail(email) },
        ],
      },
    ],
  }).select("+passwordHash");
  const passwordMatches = await verifyPassword(
    password,
    owner?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!owner || !passwordMatches) {
    return null;
  }

  owner.lastLoginAt = new Date();
  // Do not force legacy documents through new required-field validation during rollout.
  await owner.save({ validateBeforeSave: false });

  return {
    id: owner._id.toString(),
    email: owner.email,
    displayName: owner.displayName,
  };
}

export async function createSession(
  userId: string | Types.ObjectId,
  userAgent: string | null,
): Promise<CreatedSession> {
  await connectToDatabase();
  if (!(await OwnerModel.exists({ _id: userId, ...ACTIVE_ACCOUNT_FILTER }))) {
    throw new Error("Account is not eligible for a session.");
  }
  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = getSessionExpiration(now);

  await AuthSessionModel.create({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
    lastUsedAt: now,
    userAgent,
    revokedAt: null,
  });

  return { token, expiresAt };
}

export async function validateSessionToken(
  token: string,
): Promise<AuthenticatedOwner | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  await connectToDatabase();
  const now = new Date();
  const session = await AuthSessionModel.findOne({
    tokenHash: hashSessionToken(token),
    expiresAt: { $gt: now },
    revokedAt: null,
  });

  if (!session) {
    return null;
  }

  const owner = await OwnerModel.findOne({
    _id: session.userId,
    ...ACTIVE_ACCOUNT_FILTER,
  });
  if (!owner) {
    return null;
  }

  if (now.getTime() - session.lastUsedAt.getTime() > 5 * 60 * 1_000) {
    session.lastUsedAt = now;
    await session.save();
  }

  return {
    id: owner._id.toString(),
    email: owner.email,
    displayName: owner.displayName,
  };
}

/** Compatibility alias: owner means the user owning the current session, never a singleton. */
export const authenticateOwner = authenticateUser;

export async function revokeSession(token: string): Promise<void> {
  await connectToDatabase();
  await AuthSessionModel.updateOne(
    { tokenHash: hashSessionToken(token), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
