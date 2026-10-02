import "server-only";

import type { Types } from "mongoose";

import { calculateChallengeDay } from "@/server/calculations";
import { formatCalendarDate } from "@/lib/utils/calendar-date";
import { connectToDatabase } from "@/server/db/mongoose";
import { evaluateDailyQuestRecord } from "@/server/daily-quest/record-evaluation";
import type { EmailProvider } from "@/server/email/email-provider";
import { createDailyQuestReminderEmail } from "@/server/email/templates/daily-quest-reminder-email";
import { DailyQuestRecordModel } from "@/server/models/daily-quest-record";
import {
  DAILY_QUEST_EMAIL_DELIVERY_TYPE,
  DailyQuestEmailDeliveryModel,
} from "@/server/models/daily-quest-email-delivery";
import { NotificationPreferencesModel } from "@/server/models/notification-preferences";
import type { OwnerDocument } from "@/server/models/owner";
import { UserProfileModel } from "@/server/models/user-profile";
import { WinterArcConfigModel } from "@/server/models/winter-arc-config";
import {
  DAILY_QUEST_EMAIL_MAX_ATTEMPTS,
  getZonedDateTime,
  isDailyQuestEmailWindow,
} from "@/server/notifications/notification-policy";

export type DailyQuestEmailReminderOutcome =
  | "SENT"
  | "FAILED"
  | "SKIPPED_ACCOUNT"
  | "SKIPPED_EMAIL"
  | "SKIPPED_PROFILE"
  | "SKIPPED_TIMEZONE"
  | "SKIPPED_WINDOW"
  | "SKIPPED_PREFERENCE"
  | "SKIPPED_CHALLENGE"
  | "SKIPPED_COMPLETE"
  | "SKIPPED_NO_RULES"
  | "SKIPPED_DEDUPE";

export interface DailyQuestEmailReminderResult {
  readonly outcome: DailyQuestEmailReminderOutcome;
  readonly eligible: boolean;
}

interface ReminderOwner {
  readonly _id: OwnerDocument["_id"];
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly status: OwnerDocument["status"];
  readonly isActive: boolean;
}

interface ReminderDependencies {
  readonly provider: EmailProvider;
  readonly applicationOrigin: string;
}

function isDuplicateKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function releaseClaim(deliveryId: Types.ObjectId) {
  await DailyQuestEmailDeliveryModel.updateOne(
    { _id: deliveryId, state: "SENDING" },
    {
      $set: { state: "PENDING", claimedAt: null },
      $inc: { attemptCount: -1 },
    },
  );
}

export async function sendDailyQuestEmailReminderForOwner(
  owner: ReminderOwner,
  now: Date,
  dependencies: ReminderDependencies,
): Promise<DailyQuestEmailReminderResult> {
  if (owner.status !== "ACTIVE" || !owner.isActive)
    return { outcome: "SKIPPED_ACCOUNT", eligible: false };
  if (!owner.emailVerifiedAt || !owner.email)
    return { outcome: "SKIPPED_EMAIL", eligible: false };

  await connectToDatabase();
  const [profile, preferences, config] = await Promise.all([
    UserProfileModel.findOne({ userId: owner._id }),
    NotificationPreferencesModel.findOne({ userId: owner._id }),
    WinterArcConfigModel.findOne({ userId: owner._id, status: "ACTIVE" }).sort({
      createdAt: -1,
    }),
  ]);
  if (!profile) return { outcome: "SKIPPED_PROFILE", eligible: false };
  if (!preferences?.dailyQuestEmailReminder)
    return { outcome: "SKIPPED_PREFERENCE", eligible: false };
  if (!config) return { outcome: "SKIPPED_CHALLENGE", eligible: false };

  let zoned: ReturnType<typeof getZonedDateTime>;
  try {
    zoned = getZonedDateTime(now, profile.timezone);
  } catch {
    return { outcome: "SKIPPED_TIMEZONE", eligible: false };
  }
  if (!isDailyQuestEmailWindow(zoned.localTime))
    return { outcome: "SKIPPED_WINDOW", eligible: false };

  const challenge = calculateChallengeDay({
    startDate: formatCalendarDate(config.startDate),
    currentDate: zoned.localDate,
    timezone: profile.timezone,
    durationDays: config.durationDays,
  });
  if (challenge.status !== "ACTIVE")
    return { outcome: "SKIPPED_CHALLENGE", eligible: false };

  const questFilter = {
    userId: owner._id,
    winterArcConfigId: config._id,
    date: zoned.localDate,
  };
  let questRecord = await DailyQuestRecordModel.findOne(questFilter);
  let completed = 0;
  let total = config.rules.filter(
    (rule) => rule.enabled && rule.key !== "workout",
  ).length;
  if (questRecord) {
    const quest = evaluateDailyQuestRecord(
      questRecord,
      config.durationDays,
      zoned.localDate,
    );
    if (quest.isPerfectDay) return { outcome: "SKIPPED_COMPLETE", eligible: false };
    completed = quest.completedRequiredRules;
    total = quest.totalRequiredRules;
  }
  if (total === 0) return { outcome: "SKIPPED_NO_RULES", eligible: false };

  await DailyQuestEmailDeliveryModel.init();
  const identity = {
    userId: owner._id,
    winterArcConfigId: config._id,
    localDate: zoned.localDate,
    type: DAILY_QUEST_EMAIL_DELIVERY_TYPE,
  };
  try {
    await DailyQuestEmailDeliveryModel.updateOne(
      identity,
      {
        $setOnInsert: {
          ...identity,
          timezone: profile.timezone,
          state: "PENDING",
          attemptCount: 0,
          claimedAt: null,
          sentAt: null,
          failedAt: null,
          failureCode: null,
        },
      },
      { upsert: true, setDefaultsOnInsert: true, runValidators: true },
    );
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }

  const delivery = await DailyQuestEmailDeliveryModel.findOneAndUpdate(
    {
      ...identity,
      state: { $in: ["PENDING", "FAILED"] },
      attemptCount: { $lt: DAILY_QUEST_EMAIL_MAX_ATTEMPTS },
    },
    {
      $set: {
        state: "SENDING",
        claimedAt: now,
        failedAt: null,
        failureCode: null,
      },
      $inc: { attemptCount: 1 },
    },
    { returnDocument: "after", runValidators: true },
  );
  if (!delivery) return { outcome: "SKIPPED_DEDUPE", eligible: true };

  // Re-read the two facts users can change immediately before delivery.
  const [latestPreferences, latestQuestRecord] = await Promise.all([
    NotificationPreferencesModel.findOne({ userId: owner._id }).select({
      dailyQuestEmailReminder: 1,
    }),
    DailyQuestRecordModel.findOne(questFilter),
  ]);
  if (!latestPreferences?.dailyQuestEmailReminder) {
    await releaseClaim(delivery._id);
    return { outcome: "SKIPPED_PREFERENCE", eligible: false };
  }
  questRecord = latestQuestRecord;
  if (questRecord) {
    const latestQuest = evaluateDailyQuestRecord(
      questRecord,
      config.durationDays,
      zoned.localDate,
    );
    if (latestQuest.isPerfectDay) {
      await releaseClaim(delivery._id);
      return { outcome: "SKIPPED_COMPLETE", eligible: false };
    }
    completed = latestQuest.completedRequiredRules;
    total = latestQuest.totalRequiredRules;
  }

  try {
    await dependencies.provider.send(
      createDailyQuestReminderEmail({
        to: owner.email,
        completed,
        total,
        applicationOrigin: dependencies.applicationOrigin,
      }),
    );
  } catch {
    await DailyQuestEmailDeliveryModel.updateOne(
      { _id: delivery._id, state: "SENDING" },
      {
        $set: {
          state: "FAILED",
          failedAt: now,
          failureCode: "EMAIL_DELIVERY_FAILED",
        },
      },
    );
    return { outcome: "FAILED", eligible: true };
  }

  // A post-SMTP database failure intentionally leaves SENDING terminal for the day:
  // avoiding a duplicate email is safer than automatically reclaiming an ambiguous send.
  await DailyQuestEmailDeliveryModel.updateOne(
    { _id: delivery._id, state: "SENDING" },
    { $set: { state: "SENT", sentAt: now, failureCode: null } },
  );
  return { outcome: "SENT", eligible: true };
}
