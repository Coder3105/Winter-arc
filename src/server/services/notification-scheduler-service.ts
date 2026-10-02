import "server-only";

import mongoose from "mongoose";

import { getConfiguredApplicationOrigin } from "@/lib/env/server";
import { ACTIVE_ACCOUNT_FILTER } from "@/server/auth/account-status";
import { connectToDatabase } from "@/server/db/mongoose";
import { createEmailProvider, type EmailProvider } from "@/server/email/email-provider";
import { AppError } from "@/server/errors/app-error";
import { OwnerModel } from "@/server/models/owner";
import {
  sendDailyQuestEmailReminderForOwner,
  type DailyQuestEmailReminderOutcome,
} from "@/server/services/daily-quest-email-reminder-service";
import { evaluateAllNotifications } from "@/server/services/notification-service";

export const NOTIFICATION_SCHEDULER_BATCH_SIZE = 100;

export interface NotificationSchedulerOptions {
  readonly cursor?: string | null;
  readonly batchSize?: number;
  readonly emailProvider?: EmailProvider | null;
  readonly applicationOrigin?: string | null;
}

function runtimeEmailDependencies(options: NotificationSchedulerOptions) {
  if (options.emailProvider !== undefined || options.applicationOrigin !== undefined) {
    return options.emailProvider && options.applicationOrigin
      ? {
          provider: options.emailProvider,
          applicationOrigin: options.applicationOrigin,
        }
      : null;
  }
  try {
    const applicationOrigin = getConfiguredApplicationOrigin();
    if (!applicationOrigin) return null;
    const url = new URL(applicationOrigin);
    if (
      process.env.NODE_ENV === "production" &&
      (url.protocol !== "https:" ||
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]")
    )
      return null;
    return { provider: createEmailProvider(), applicationOrigin };
  } catch {
    return null;
  }
}

function increment(
  outcomes: Record<DailyQuestEmailReminderOutcome, number>,
  outcome: DailyQuestEmailReminderOutcome,
) {
  outcomes[outcome] += 1;
}

export async function runNotificationScheduler(
  now = new Date(),
  options: NotificationSchedulerOptions = {},
) {
  await connectToDatabase();
  const requestedBatchSize = options.batchSize ?? NOTIFICATION_SCHEDULER_BATCH_SIZE;
  const batchSize = Math.max(
    1,
    Math.min(requestedBatchSize, NOTIFICATION_SCHEDULER_BATCH_SIZE),
  );
  const cursor = options.cursor ?? null;
  if (cursor && !mongoose.Types.ObjectId.isValid(cursor))
    throw new AppError("VALIDATION_ERROR");

  const filter = cursor
    ? {
        $and: [
          ACTIVE_ACCOUNT_FILTER,
          { _id: { $gt: new mongoose.Types.ObjectId(cursor) } },
        ],
      }
    : ACTIVE_ACCOUNT_FILTER;
  const owners = await OwnerModel.find(filter)
    .select("_id email emailVerifiedAt status isActive")
    .sort({ _id: 1 })
    .limit(batchSize + 1);
  const hasMore = owners.length > batchSize;
  const batch = hasMore ? owners.slice(0, batchSize) : owners;
  const emailDependencies = runtimeEmailDependencies(options);
  const outcomes: Record<DailyQuestEmailReminderOutcome, number> = {
    SENT: 0,
    FAILED: 0,
    SKIPPED_ACCOUNT: 0,
    SKIPPED_EMAIL: 0,
    SKIPPED_PROFILE: 0,
    SKIPPED_TIMEZONE: 0,
    SKIPPED_WINDOW: 0,
    SKIPPED_PREFERENCE: 0,
    SKIPPED_CHALLENGE: 0,
    SKIPPED_COMPLETE: 0,
    SKIPPED_NO_RULES: 0,
    SKIPPED_DEDUPE: 0,
  };
  let usersEvaluated = 0;
  let usersFailed = 0;
  let eligibleUsers = 0;

  for (const owner of batch) {
    const userId = owner._id.toString();
    try {
      await evaluateAllNotifications(userId, now);
      usersEvaluated += 1;
    } catch {
      usersFailed += 1;
    }
    if (!emailDependencies) continue;
    try {
      const result = await sendDailyQuestEmailReminderForOwner(
        owner,
        now,
        emailDependencies,
      );
      if (result.eligible) eligibleUsers += 1;
      increment(outcomes, result.outcome);
    } catch {
      outcomes.FAILED += 1;
    }
  }

  return {
    processedUsers: batch.length,
    eligibleUsers,
    sent: outcomes.SENT,
    skippedComplete: outcomes.SKIPPED_COMPLETE,
    failed: outcomes.FAILED,
    providerConfigured: Boolean(emailDependencies),
    nextCursor: hasMore && batch.length ? batch.at(-1)!._id.toString() : null,
    push: { usersEvaluated, usersFailed },
    skipped: {
      preference: outcomes.SKIPPED_PREFERENCE,
      window: outcomes.SKIPPED_WINDOW,
      challenge: outcomes.SKIPPED_CHALLENGE,
      timezone: outcomes.SKIPPED_TIMEZONE,
      email: outcomes.SKIPPED_EMAIL,
      profile: outcomes.SKIPPED_PROFILE,
      dedupe: outcomes.SKIPPED_DEDUPE,
      noRules: outcomes.SKIPPED_NO_RULES,
    },
  } as const;
}
