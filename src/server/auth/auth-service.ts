import "server-only";

import type { Types } from "mongoose";

import { connectToDatabase } from "@/server/db/mongoose";
import { AuthSessionModel } from "@/server/models/auth-session";
import { OwnerModel } from "@/server/models/owner";

import { verifyPassword } from "./password";
import {
  generateSessionToken,
  getSessionExpiration,
  hashSessionToken,
} from "./session-token";

const DUMMY_PASSWORD_HASH =
  "$2b$12$PMmO3vFeSCloBE4n1rZFmugXZNO3sLzWXSZ2vSvk3xe.aYaBWhtvm";

export interface AuthenticatedOwner {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

export interface CreatedSession {
  readonly token: string;
  readonly expiresAt: Date;
}

export async function authenticateOwner(
  email: string,
  password: string,
): Promise<AuthenticatedOwner | null> {
  await connectToDatabase();
  const owner = await OwnerModel.findOne({
    email: email.toLowerCase(),
    isActive: true,
  }).select("+passwordHash");
  const passwordMatches = await verifyPassword(
    password,
    owner?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!owner || !passwordMatches) {
    return null;
  }

  owner.lastLoginAt = new Date();
  await owner.save();

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

  const owner = await OwnerModel.findOne({ _id: session.userId, isActive: true });
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

export async function revokeSession(token: string): Promise<void> {
  await connectToDatabase();
  await AuthSessionModel.updateOne(
    { tokenHash: hashSessionToken(token), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
