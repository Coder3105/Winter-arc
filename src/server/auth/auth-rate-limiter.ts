import "server-only";

import { getOtpPepper } from "@/server/email/email-provider";
import { AppError } from "@/server/errors/app-error";
import {
  AuthRateLimitModel,
  type AuthRateLimitScope,
} from "@/server/models/auth-rate-limit";
import { connectToDatabase } from "@/server/db/mongoose";
import { opaqueSubjectHash } from "./otp-crypto";

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === 11000
  );
}

export function getRequestClientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const candidate =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  return candidate.slice(0, 128);
}

export async function consumeAuthRateLimit(input: {
  readonly scope: AuthRateLimitScope;
  readonly subject: string;
  readonly limit: number;
  readonly windowSeconds: number;
  readonly now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const windowMs = input.windowSeconds * 1_000;
  const windowStartedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStartedAt.getTime() + windowMs * 2);
  const subjectHash = opaqueSubjectHash(input.scope, input.subject, getOtpPepper());
  const filter = { scope: input.scope, subjectHash, windowStartedAt };

  await connectToDatabase();
  await AuthRateLimitModel.init();

  let record;
  try {
    record = await AuthRateLimitModel.findOneAndUpdate(
      filter,
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, new: true, setDefaultsOnInsert: false },
    );
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    record = await AuthRateLimitModel.findOneAndUpdate(
      filter,
      { $inc: { count: 1 } },
      { new: true },
    );
  }

  if (!record || record.count > input.limit) throw new AppError("OTP_RATE_LIMITED");
}
