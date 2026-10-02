import "server-only";

import type { Types } from "mongoose";

import { normalizeEmail } from "@/lib/auth/email";
import type { EmailProvider } from "@/server/email/email-provider";
import { createEmailProvider, getOtpPepper } from "@/server/email/email-provider";
import {
  createGuildInviteEmail,
  createLoginOtpEmail,
  createRegistrationOtpEmail,
} from "@/server/email/templates/auth-emails";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import { EmailOtpModel } from "@/server/models/email-otp";
import { OwnerModel } from "@/server/models/owner";
import { createVerifiedUserAccount } from "@/server/services/user-account-service";
import {
  GUILD_INVITER_SEND_LIMIT,
  GUILD_SEND_WINDOW_SECONDS,
  GUILD_TARGET_SEND_LIMIT,
} from "@/server/guild/guild-policy";
import { ACTIVE_ACCOUNT_FILTER } from "./account-status";
import { consumeAuthRateLimit } from "./auth-rate-limiter";
import {
  generateOtpCode,
  generateOtpRequestId,
  hashOtp,
  verifyOtpHash,
} from "./otp-crypto";
import {
  OTP_EMAIL_SEND_LIMIT,
  OTP_EMAIL_WINDOW_SECONDS,
  OTP_IP_REQUEST_LIMIT,
  OTP_IP_WINDOW_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  OTP_VERIFY_IP_LIMIT,
  type OtpPurpose,
  type PublicOtpPurpose,
} from "./otp-policy";
import type { AuthenticatedUser } from "./auth-service";

type RateLimitFunction = typeof consumeAuthRateLimit;

export interface OtpServiceDependencies {
  readonly now?: Date;
  readonly pepper?: string;
  readonly provider?: EmailProvider;
  readonly rateLimit?: RateLimitFunction;
}

export interface OtpRequestResult {
  readonly requestId: string;
  readonly expiresInSeconds: number;
  readonly resendAvailableInSeconds: number;
  readonly message: string;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === 11000
  );
}

function activeAccountQuery(emailNormalized: string) {
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

function result(requestId: string, purpose: OtpPurpose = "LOGIN"): OtpRequestResult {
  return {
    requestId,
    expiresInSeconds: OTP_TTL_SECONDS,
    resendAvailableInSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    message:
      purpose === "GUILD_INVITE"
        ? "Guild verification code sent to the existing account."
        : "If the account is eligible, an authentication code has been sent.",
  };
}

async function enforceRequestLimits(
  purpose: PublicOtpPurpose,
  emailNormalized: string,
  clientAddress: string,
  now: Date,
  rateLimit: RateLimitFunction,
) {
  await rateLimit({
    scope: "OTP_EMAIL_SEND",
    subject: `${purpose}:${emailNormalized}`,
    limit: OTP_EMAIL_SEND_LIMIT,
    windowSeconds: OTP_EMAIL_WINDOW_SECONDS,
    now,
  });
  await rateLimit({
    scope: "OTP_IP_REQUEST",
    subject: clientAddress,
    limit: OTP_IP_REQUEST_LIMIT,
    windowSeconds: OTP_IP_WINDOW_SECONDS,
    now,
  });
}

async function issueOtp(
  purpose: OtpPurpose,
  emailNormalized: string,
  contextKey: string | null,
  dependencies: Required<Pick<OtpServiceDependencies, "now" | "pepper" | "provider">>,
  messageFactory?: (otp: string) => ReturnType<typeof createGuildInviteEmail>,
): Promise<OtpRequestResult> {
  const requestId = generateOtpRequestId();
  const otp = generateOtpCode();
  const identity = { purpose, requestId, emailNormalized, contextKey };
  const expiresAt = new Date(dependencies.now.getTime() + OTP_TTL_SECONDS * 1_000);
  const cooldownBoundary = new Date(
    dependencies.now.getTime() - OTP_RESEND_COOLDOWN_SECONDS * 1_000,
  );

  await EmailOtpModel.init();
  try {
    await EmailOtpModel.findOneAndUpdate(
      {
        emailNormalized,
        purpose,
        contextKey,
        $or: [
          { lastSentAt: { $lte: cooldownBoundary } },
          { lastSentAt: { $exists: false } },
        ],
      },
      {
        $setOnInsert: { emailNormalized, purpose, contextKey },
        $set: {
          requestId,
          otpHash: hashOtp(identity, otp, dependencies.pepper),
          status: "PENDING_SEND",
          expiresAt,
          attemptCount: 0,
          maxAttempts: OTP_MAX_ATTEMPTS,
          lastSentAt: dependencies.now,
          consumedAt: null,
        },
        $inc: { sendCount: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: false },
    );
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError("OTP_RESEND_COOLDOWN");
    throw error;
  }

  const message = messageFactory
    ? messageFactory(otp)
    : purpose === "REGISTER"
      ? createRegistrationOtpEmail({
          to: emailNormalized,
          otp,
          expiresInMinutes: OTP_TTL_SECONDS / 60,
        })
      : createLoginOtpEmail({
          to: emailNormalized,
          otp,
          expiresInMinutes: OTP_TTL_SECONDS / 60,
        });

  try {
    await dependencies.provider.send(message);
  } catch (error) {
    await EmailOtpModel.updateOne(
      { emailNormalized, purpose, contextKey, requestId, status: "PENDING_SEND" },
      { $set: { status: "INVALIDATED" } },
    );
    if (error instanceof AppError) throw error;
    throw new AppError("EMAIL_DELIVERY_FAILED");
  }

  const sent = await EmailOtpModel.updateOne(
    { emailNormalized, purpose, contextKey, requestId, status: "PENDING_SEND" },
    { $set: { status: "SENT" } },
  );
  if (sent.modifiedCount !== 1) throw new AppError("INTERNAL_ERROR");
  return result(requestId, purpose);
}

function resolveDependencies(dependencies: OtpServiceDependencies) {
  return {
    now: dependencies.now ?? new Date(),
    pepper: dependencies.pepper ?? getOtpPepper(),
    provider: dependencies.provider ?? createEmailProvider(),
    rateLimit: dependencies.rateLimit ?? consumeAuthRateLimit,
  };
}

function resolveVerificationDependencies(dependencies: OtpServiceDependencies) {
  return {
    now: dependencies.now ?? new Date(),
    pepper: dependencies.pepper ?? getOtpPepper(),
    rateLimit: dependencies.rateLimit ?? consumeAuthRateLimit,
  };
}

export async function requestRegistrationOtp(
  email: string,
  clientAddress: string,
  dependencies: OtpServiceDependencies = {},
): Promise<OtpRequestResult> {
  const emailNormalized = normalizeEmail(email);
  const resolved = resolveDependencies(dependencies);
  await connectToDatabase();
  await enforceRequestLimits(
    "REGISTER",
    emailNormalized,
    clientAddress,
    resolved.now,
    resolved.rateLimit,
  );
  if (await OwnerModel.exists({ emailNormalized })) {
    throw new AppError("ACCOUNT_ALREADY_EXISTS");
  }
  return issueOtp("REGISTER", emailNormalized, null, resolved);
}

export async function requestLoginOtp(
  email: string,
  clientAddress: string,
  dependencies: OtpServiceDependencies = {},
): Promise<OtpRequestResult> {
  const emailNormalized = normalizeEmail(email);
  const resolved = resolveDependencies(dependencies);
  await connectToDatabase();
  await enforceRequestLimits(
    "LOGIN",
    emailNormalized,
    clientAddress,
    resolved.now,
    resolved.rateLimit,
  );
  if (!(await OwnerModel.exists(activeAccountQuery(emailNormalized)))) {
    return result(generateOtpRequestId(), "LOGIN");
  }
  return issueOtp("LOGIN", emailNormalized, null, resolved);
}

async function recordFailedAttempt(recordId: Types.ObjectId, now: Date) {
  await EmailOtpModel.updateOne(
    {
      _id: recordId,
      status: "SENT",
      expiresAt: { $gt: now },
      attemptCount: { $lt: OTP_MAX_ATTEMPTS },
    },
    { $inc: { attemptCount: 1 } },
  );
  await EmailOtpModel.updateOne(
    { _id: recordId, status: "SENT", attemptCount: { $gte: OTP_MAX_ATTEMPTS } },
    { $set: { status: "INVALIDATED" } },
  );
}

async function consumeOtp(input: {
  readonly purpose: OtpPurpose;
  readonly emailNormalized: string;
  readonly contextKey: string | null;
  readonly requestId: string;
  readonly otp: string;
  readonly clientAddress: string;
  readonly now: Date;
  readonly pepper: string;
  readonly rateLimit: RateLimitFunction;
}) {
  await input.rateLimit({
    scope: "OTP_IP_VERIFY",
    subject: input.clientAddress,
    limit: OTP_VERIFY_IP_LIMIT,
    windowSeconds: OTP_IP_WINDOW_SECONDS,
    now: input.now,
  });
  const record = await EmailOtpModel.findOne({
    emailNormalized: input.emailNormalized,
    purpose: input.purpose,
    contextKey: input.contextKey,
    requestId: input.requestId,
  }).select("+otpHash");

  if (
    !record ||
    record.status !== "SENT" ||
    record.expiresAt.getTime() <= input.now.getTime() ||
    record.attemptCount >= record.maxAttempts
  ) {
    throw new AppError("OTP_INVALID");
  }

  const identity = {
    purpose: input.purpose,
    requestId: input.requestId,
    emailNormalized: input.emailNormalized,
    contextKey: input.contextKey,
  };
  if (!verifyOtpHash(identity, input.otp, record.otpHash, input.pepper)) {
    await recordFailedAttempt(record._id, input.now);
    throw new AppError("OTP_INVALID");
  }

  const consumed = await EmailOtpModel.findOneAndUpdate(
    {
      _id: record._id,
      requestId: input.requestId,
      otpHash: record.otpHash,
      status: "SENT",
      expiresAt: { $gt: input.now },
      attemptCount: { $lt: record.maxAttempts },
    },
    { $set: { status: "CONSUMED", consumedAt: input.now } },
    { new: true },
  );
  if (!consumed) throw new AppError("OTP_INVALID");
}

export async function verifyRegistrationOtp(
  input: {
    readonly email: string;
    readonly requestId: string;
    readonly otp: string;
    readonly password: string;
    readonly clientAddress: string;
  },
  dependencies: OtpServiceDependencies = {},
): Promise<AuthenticatedUser> {
  const emailNormalized = normalizeEmail(input.email);
  const resolved = resolveVerificationDependencies(dependencies);
  await connectToDatabase();
  if (await OwnerModel.exists({ emailNormalized })) {
    throw new AppError("ACCOUNT_ALREADY_EXISTS");
  }
  await consumeOtp({
    ...input,
    emailNormalized,
    purpose: "REGISTER",
    contextKey: null,
    now: resolved.now,
    pepper: resolved.pepper,
    rateLimit: resolved.rateLimit,
  });
  return createVerifiedUserAccount({
    email: emailNormalized,
    password: input.password,
    emailVerifiedAt: resolved.now,
  });
}

export async function verifyLoginOtp(
  input: {
    readonly email: string;
    readonly requestId: string;
    readonly otp: string;
    readonly clientAddress: string;
  },
  dependencies: OtpServiceDependencies = {},
): Promise<AuthenticatedUser> {
  const emailNormalized = normalizeEmail(input.email);
  const resolved = resolveVerificationDependencies(dependencies);
  await connectToDatabase();
  const owner = await OwnerModel.findOne(activeAccountQuery(emailNormalized));
  if (!owner) throw new AppError("OTP_INVALID");

  await consumeOtp({
    ...input,
    emailNormalized,
    purpose: "LOGIN",
    contextKey: null,
    now: resolved.now,
    pepper: resolved.pepper,
    rateLimit: resolved.rateLimit,
  });

  const active = await OwnerModel.findOneAndUpdate(
    { _id: owner._id, ...ACTIVE_ACCOUNT_FILTER },
    { $set: { lastLoginAt: resolved.now } },
    { new: true },
  );
  if (!active) throw new AppError("OTP_INVALID");
  if (!active.emailVerifiedAt) {
    await OwnerModel.updateOne(
      { _id: active._id, emailVerifiedAt: null },
      { $set: { emailVerifiedAt: resolved.now } },
    );
  }
  return {
    id: active._id.toString(),
    email: active.email,
    displayName: active.displayName,
  };
}

export async function requestGuildInviteOtp(
  input: {
    readonly email: string;
    readonly contextKey: string;
    readonly inviterUserId: string;
    readonly inviterDisplayName: string;
    readonly clientAddress: string;
  },
  dependencies: OtpServiceDependencies = {},
): Promise<OtpRequestResult> {
  const emailNormalized = normalizeEmail(input.email);
  const resolved = resolveDependencies(dependencies);
  await connectToDatabase();
  await resolved.rateLimit({
    scope: "GUILD_INVITER_SEND",
    subject: input.inviterUserId,
    limit: GUILD_INVITER_SEND_LIMIT,
    windowSeconds: GUILD_SEND_WINDOW_SECONDS,
    now: resolved.now,
  });
  await resolved.rateLimit({
    scope: "GUILD_TARGET_SEND",
    subject: emailNormalized,
    limit: GUILD_TARGET_SEND_LIMIT,
    windowSeconds: GUILD_SEND_WINDOW_SECONDS,
    now: resolved.now,
  });
  await resolved.rateLimit({
    scope: "OTP_IP_REQUEST",
    subject: input.clientAddress,
    limit: OTP_IP_REQUEST_LIMIT,
    windowSeconds: OTP_IP_WINDOW_SECONDS,
    now: resolved.now,
  });
  return issueOtp("GUILD_INVITE", emailNormalized, input.contextKey, resolved, (otp) =>
    createGuildInviteEmail({
      to: emailNormalized,
      inviterDisplayName: input.inviterDisplayName,
      otp,
      expiresInMinutes: OTP_TTL_SECONDS / 60,
    }),
  );
}

export async function consumeGuildInviteOtp(
  input: {
    readonly email: string;
    readonly contextKey: string;
    readonly requestId: string;
    readonly otp: string;
    readonly clientAddress: string;
  },
  dependencies: OtpServiceDependencies = {},
): Promise<void> {
  const resolved = resolveVerificationDependencies(dependencies);
  const emailNormalized = normalizeEmail(input.email);
  await connectToDatabase();
  await consumeOtp({
    purpose: "GUILD_INVITE",
    emailNormalized,
    contextKey: input.contextKey,
    requestId: input.requestId,
    otp: input.otp,
    clientAddress: input.clientAddress,
    now: resolved.now,
    pepper: resolved.pepper,
    rateLimit: resolved.rateLimit,
  });
}

export async function isGuildInviteOtpConsumed(input: {
  readonly email: string;
  readonly contextKey: string;
  readonly requestId: string;
}): Promise<boolean> {
  await connectToDatabase();
  return Boolean(
    await EmailOtpModel.exists({
      emailNormalized: normalizeEmail(input.email),
      purpose: "GUILD_INVITE",
      contextKey: input.contextKey,
      requestId: input.requestId,
      status: "CONSUMED",
    }),
  );
}
