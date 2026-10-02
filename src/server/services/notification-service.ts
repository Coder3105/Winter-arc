import "server-only";

import mongoose from "mongoose";

import { isSafeInternalPath } from "@/lib/pwa/safe-path";
import { getAchievementDefinition } from "@/server/achievements/achievement-policy";
import {
  calculateChallengeDay,
  calculateLevelFromXp,
  challengeDayToWeek,
  evaluateWorkoutWeek,
  getRankForLevel,
} from "@/server/calculations";
import { connectToDatabase } from "@/server/db/mongoose";
import { evaluateDailyQuestRecord } from "@/server/daily-quest/record-evaluation";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationPreferencesInputSchema,
  type NotificationPreferencesInput,
} from "@/lib/validation/notification-preferences";
import { AppError } from "@/server/errors/app-error";
import { AchievementUnlockModel } from "@/server/models/achievement-unlock";
import { DailyQuestRecordModel } from "@/server/models/daily-quest-record";
import {
  NotificationPreferencesModel,
  type NotificationPreferencesDocument,
} from "@/server/models/notification-preferences";
import {
  NotificationRecordModel,
  type NotificationRecordDocument,
} from "@/server/models/notification-record";
import { ProgressionEventModel } from "@/server/models/progression-event";
import { RecoveryProtocolModel } from "@/server/models/recovery-protocol";
import { RewardGrantModel } from "@/server/models/reward-grant";
import { WeeklyReportModel } from "@/server/models/weekly-report";
import { WeightRecordModel } from "@/server/models/weight-record";
import { WorkoutRecordModel } from "@/server/models/workout-record";

import {
  NOTIFICATION_POLICY_VERSION,
  TIME_BASED_DAILY_CEILING,
  evaluateEventNotifications,
  evaluateTimeBasedNotifications,
  getZonedDateTime,
  type NotificationCandidate,
} from "../notifications/notification-policy";
import {
  WebPushNotificationTransport,
  type NotificationTransport,
} from "../notifications/notification-transport";
import { getProfile } from "./profile-service";
import { getWinterArcConfig } from "./winter-arc-service";

const transport: NotificationTransport = new WebPushNotificationTransport();

function isDuplicateKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function preferencesDto(
  document: NotificationPreferencesDocument | null,
  timezone: string,
) {
  const source = document ?? DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    enabled: source.enabled,
    dailyQuestEmailReminder: source.dailyQuestEmailReminder ?? false,
    timezone,
    privacyMode: source.privacyMode,
    quietHours: {
      enabled: source.quietHours.enabled,
      startLocalTime: source.quietHours.startLocalTime,
      endLocalTime: source.quietHours.endLocalTime,
    },
    dailyQuest: {
      enabled: source.dailyQuest.enabled,
      time: source.dailyQuest.time,
    },
    morningWeight: {
      enabled: source.morningWeight.enabled,
      time: source.morningWeight.time,
    },
    hydration: {
      enabled: source.hydration.enabled,
      times: [...source.hydration.times],
    },
    steps: { enabled: source.steps.enabled, time: source.steps.time },
    workout: { enabled: source.workout.enabled },
    recovery: { enabled: source.recovery.enabled },
    weeklyReport: {
      enabled: source.weeklyReport.enabled,
      time: source.weeklyReport.time,
    },
    achievementReward: { enabled: source.achievementReward.enabled },
    isPersisted: Boolean(document),
  } as const;
}

function asPolicyPreferences(
  document: NotificationPreferencesDocument | null,
): NotificationPreferencesInput {
  const source = document ?? DEFAULT_NOTIFICATION_PREFERENCES;
  return notificationPreferencesInputSchema.parse({
    enabled: source.enabled,
    dailyQuestEmailReminder: source.dailyQuestEmailReminder ?? false,
    privacyMode: source.privacyMode,
    quietHours: {
      enabled: source.quietHours.enabled,
      startLocalTime: source.quietHours.startLocalTime,
      endLocalTime: source.quietHours.endLocalTime,
    },
    dailyQuest: { enabled: source.dailyQuest.enabled, time: source.dailyQuest.time },
    morningWeight: {
      enabled: source.morningWeight.enabled,
      time: source.morningWeight.time,
    },
    hydration: {
      enabled: source.hydration.enabled,
      times: [...source.hydration.times],
    },
    steps: { enabled: source.steps.enabled, time: source.steps.time },
    workout: { enabled: source.workout.enabled },
    recovery: { enabled: source.recovery.enabled },
    weeklyReport: {
      enabled: source.weeklyReport.enabled,
      time: source.weeklyReport.time,
    },
    achievementReward: { enabled: source.achievementReward.enabled },
  });
}

export async function getNotificationPreferences(userId: string) {
  const profile = await getProfile(userId);
  if (!profile) return { kind: "UNAVAILABLE", reason: "PROFILE_REQUIRED" } as const;
  await connectToDatabase();
  const preferences = await NotificationPreferencesModel.findOne({ userId });
  return {
    kind: "AVAILABLE",
    preferences: preferencesDto(preferences, profile.timezone),
  } as const;
}

export async function saveNotificationPreferences(
  userId: string,
  input: NotificationPreferencesInput,
) {
  const parsed = notificationPreferencesInputSchema.parse(input);
  const profile = await getProfile(userId);
  if (!profile) throw new AppError("NOTIFICATION_NOT_AVAILABLE");
  await connectToDatabase();
  const preferences = await NotificationPreferencesModel.findOneAndUpdate(
    { userId },
    {
      $set: { ...parsed, timezoneSnapshot: profile.timezone },
      $setOnInsert: { userId },
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  );
  return preferencesDto(preferences, profile.timezone);
}

function actionRouteIsControlled(route: string) {
  return isSafeInternalPath(route);
}

async function persistCandidate(
  userId: string,
  configId: string,
  candidate: NotificationCandidate,
  now: Date,
) {
  if (!actionRouteIsControlled(candidate.actionRoute))
    throw new AppError("INTERNAL_ERROR");
  const filter = {
    userId,
    winterArcConfigId: configId,
    dedupeKey: candidate.dedupeKey,
    policyVersion: NOTIFICATION_POLICY_VERSION,
  };
  try {
    const write = await NotificationRecordModel.updateOne(
      filter,
      {
        $setOnInsert: {
          ...filter,
          type: candidate.type,
          title: candidate.title,
          body: candidate.body,
          privateTitle: candidate.privateTitle,
          privateBody: candidate.privateBody,
          actionRoute: candidate.actionRoute,
          sourceType: candidate.sourceType,
          sourceKey: candidate.sourceKey,
          challengeDay: candidate.challengeDay,
          challengeWeek: candidate.challengeWeek,
          sourceDate: candidate.sourceDate,
          priority: candidate.priority,
          status: "UNREAD",
          scheduledFor: null,
          generatedAt: now,
          readAt: null,
          dismissedAt: null,
          delivery: "PUSH_PENDING",
          pushAttemptedAt: null,
          pushDeliveredAt: null,
          pushSuccessCount: 0,
          pushFailureCount: 0,
        },
      },
      {
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );
    if (write.upsertedCount === 1) {
      const delivery = await transport.send(userId, candidate, now);
      await NotificationRecordModel.updateOne(filter, {
        $set: {
          delivery: delivery.delivery,
          pushAttemptedAt: delivery.attemptedAt,
          pushDeliveredAt: delivery.deliveredAt,
          pushSuccessCount: delivery.successCount,
          pushFailureCount: delivery.failureCount,
        },
      });
    }
    return NotificationRecordModel.findOne(filter);
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    return NotificationRecordModel.findOne(filter);
  }
}

async function existingDedupeKeys(userId: string, configId: string) {
  const records = await NotificationRecordModel.find({
    userId,
    winterArcConfigId: configId,
    policyVersion: NOTIFICATION_POLICY_VERSION,
  }).select({ dedupeKey: 1 });
  return new Set(records.map((record) => record.dedupeKey));
}

export async function evaluateTimeBasedReminders(userId: string, now = new Date()) {
  const [profile, config] = await Promise.all([
    getProfile(userId),
    getWinterArcConfig(userId),
  ]);
  if (!profile) return { kind: "UNAVAILABLE", reason: "PROFILE_REQUIRED" } as const;
  if (!config || config.status !== "ACTIVE")
    return { kind: "UNAVAILABLE", reason: "CONFIGURATION_REQUIRED" } as const;
  await connectToDatabase();
  await Promise.all([
    NotificationPreferencesModel.init(),
    NotificationRecordModel.init(),
  ]);
  const preferenceDocument = await NotificationPreferencesModel.findOne({ userId });
  const preferences = asPolicyPreferences(preferenceDocument);
  if (!preferences.enabled)
    return { kind: "AVAILABLE", generated: 0, reason: "REMINDERS_DISABLED" } as const;
  const { localDate, localTime } = getZonedDateTime(now, profile.timezone);
  const challenge = calculateChallengeDay({
    startDate: config.startDate,
    currentDate: localDate,
    timezone: profile.timezone,
    durationDays: config.durationDays,
  });
  if (challenge.status !== "ACTIVE")
    return { kind: "AVAILABLE", generated: 0, reason: challenge.status } as const;
  const week = challengeDayToWeek(challenge.dayNumber, config.durationDays).weekNumber;
  const [questRecord, weight, workouts, recoveries, reports, dedupe, generatedToday] =
    await Promise.all([
      DailyQuestRecordModel.findOne({
        userId,
        winterArcConfigId: config.id,
        date: localDate,
      }),
      WeightRecordModel.exists({
        userId,
        winterArcConfigId: config.id,
        date: localDate,
      }),
      WorkoutRecordModel.find({
        userId,
        winterArcConfigId: config.id,
        status: "COMPLETED",
      }),
      RecoveryProtocolModel.find({
        userId,
        winterArcConfigId: config.id,
        status: "ACTIVE",
      }),
      WeeklyReportModel.find({
        userId,
        winterArcConfigId: config.id,
        status: "FINAL",
      }),
      existingDedupeKeys(userId, config.id),
      NotificationRecordModel.countDocuments({
        userId,
        winterArcConfigId: config.id,
        sourceType: "TIME_BASED",
        sourceDate: localDate,
      }),
    ]);
  const quest = questRecord
    ? evaluateDailyQuestRecord(questRecord, config.durationDays, localDate)
    : null;
  const workout = evaluateWorkoutWeek({
    challengeStartDate: config.startDate,
    durationDays: config.durationDays,
    challengeWeek: week,
    currentDate: localDate,
    workoutDates: workouts.map((record) => record.date),
    requiredWorkoutDays: config.weeklyWorkoutTarget,
  });
  const finalReportWeeks = reports
    .filter(
      (report) =>
        getZonedDateTime(report.generatedAt, profile.timezone).localDate === localDate,
    )
    .map((report) => report.challengeWeek);
  const candidates = evaluateTimeBasedNotifications({
    localDate,
    localTime,
    challengeActive: true,
    challengeDay: challenge.dayNumber,
    challengeWeek: week,
    configuredDailyRuleCount: config.rules.filter(
      (rule) => rule.enabled && rule.key !== "workout",
    ).length,
    quest: quest
      ? {
          isPerfectDay: quest.isPerfectDay,
          completedRequiredRules: quest.completedRequiredRules,
          totalRequiredRules: quest.totalRequiredRules,
          rules: quest.rules.map((rule) => ({
            key: rule.key,
            name: rule.name,
            type: rule.type,
            target: rule.target,
            actual: rule.actual,
            state: rule.state,
          })),
        }
      : null,
    weightLogged: Boolean(weight),
    workout: {
      state: workout.state,
      completedWorkoutDays: workout.completedWorkoutDays,
      requiredWorkoutDays: config.weeklyWorkoutTarget,
      workoutsRemaining: workout.workoutsRemaining,
      daysRemaining: workout.daysRemaining,
    },
    activeRecoveries: recoveries.map((recovery) => ({
      id: recovery._id.toString(),
      type: recovery.type,
    })),
    finalReportWeeks,
    preferences,
    existingDedupeKeys: dedupe,
  });
  const remaining = Math.max(TIME_BASED_DAILY_CEILING - generatedToday, 0);
  const selected = candidates.slice(0, remaining);
  await Promise.all(
    selected.map((candidate) => persistCandidate(userId, config.id, candidate, now)),
  );
  return {
    kind: "AVAILABLE",
    generated: selected.length,
    skippedByDailyCeiling: Math.max(candidates.length - selected.length, 0),
    localDate,
  } as const;
}

export async function reconcileEventNotifications(userId: string, now = new Date()) {
  const [profile, config] = await Promise.all([
    getProfile(userId),
    getWinterArcConfig(userId),
  ]);
  if (!profile || !config || config.status !== "ACTIVE") return null;
  await connectToDatabase();
  await Promise.all([
    NotificationPreferencesModel.init(),
    NotificationRecordModel.init(),
  ]);
  const preferenceDocument = await NotificationPreferencesModel.findOne({ userId });
  const preferences = asPolicyPreferences(preferenceDocument);
  if (!preferences.enabled) return { generated: 0 } as const;
  const [achievements, rewards, recoveries, progressionEvents, dedupe] =
    await Promise.all([
      AchievementUnlockModel.find({
        userId,
        winterArcConfigId: config.id,
        status: "ACTIVE",
      }),
      RewardGrantModel.find({
        userId,
        winterArcConfigId: config.id,
        status: "ACTIVE",
      }),
      RecoveryProtocolModel.find({
        userId,
        winterArcConfigId: config.id,
        status: "COMPLETED",
      }),
      ProgressionEventModel.find({
        userId,
        winterArcConfigId: config.id,
        status: "ACTIVE",
      }),
      existingDedupeKeys(userId, config.id),
    ]);
  const level = calculateLevelFromXp(
    progressionEvents.reduce((sum, event) => sum + event.xp, 0),
  );
  const candidates = evaluateEventNotifications({
    preferences,
    existingDedupeKeys: dedupe,
    achievements: achievements.map((achievement) => ({
      key: achievement.achievementKey,
      name:
        getAchievementDefinition(achievement.achievementKey)?.name ??
        achievement.achievementKey.replaceAll("_", " "),
      challengeDay: achievement.challengeDay,
      challengeWeek: achievement.challengeWeek,
    })),
    rewards: rewards.map((reward) => ({
      key: reward.rewardKey,
      title: reward.title,
      challengeDay: reward.challengeDay,
      challengeWeek: reward.challengeWeek,
    })),
    completedRecoveries: recoveries.map((recovery) => ({
      id: recovery._id.toString(),
      type: recovery.type,
      challengeWeek: recovery.challengeWeek,
    })),
    level,
    rank: getRankForLevel(level),
  });
  await Promise.all(
    candidates.map((candidate) => persistCandidate(userId, config.id, candidate, now)),
  );
  return { generated: candidates.length } as const;
}

export async function evaluateAllNotifications(userId: string, now = new Date()) {
  const retriedPush = await dispatchPendingPushNotifications(userId, now);
  const [timeBased, eventBased] = await Promise.all([
    evaluateTimeBasedReminders(userId, now),
    reconcileEventNotifications(userId, now),
  ]);
  return { retriedPush, timeBased, eventBased } as const;
}

export async function dispatchPendingPushNotifications(userId: string, now = new Date()) {
  await connectToDatabase();
  const records = await NotificationRecordModel.find({
    userId,
    delivery: { $in: ["PUSH_PENDING", "PUSH_FAILED"] },
  })
    .sort({ generatedAt: 1 })
    .limit(25);
  let delivered = 0;
  let failed = 0;
  let unavailable = 0;
  for (const record of records) {
    const result = await transport.send(
      userId,
      {
        type: record.type,
        title: record.title,
        body: record.body,
        privateTitle: record.privateTitle,
        privateBody: record.privateBody,
        actionRoute: record.actionRoute,
        sourceType: record.sourceType,
        sourceKey: record.sourceKey,
        challengeDay: record.challengeDay,
        challengeWeek: record.challengeWeek,
        sourceDate: record.sourceDate,
        priority: record.priority,
        dedupeKey: record.dedupeKey,
        reminderSlot: null,
      },
      now,
    );
    if (result.delivery === "PUSH_DELIVERED") delivered += 1;
    else if (result.delivery === "PUSH_FAILED") failed += 1;
    else unavailable += 1;
    await NotificationRecordModel.updateOne(
      { _id: record._id, userId, delivery: { $in: ["PUSH_PENDING", "PUSH_FAILED"] } },
      {
        $set: {
          delivery: result.delivery,
          pushAttemptedAt: result.attemptedAt,
          pushDeliveredAt: result.deliveredAt,
          pushSuccessCount: result.successCount,
          pushFailureCount: result.failureCount,
        },
      },
    );
  }
  return { attempted: records.length, delivered, failed, unavailable } as const;
}

function recordDto(record: NotificationRecordDocument) {
  return {
    id: record._id.toString(),
    type: record.type,
    title: record.privateTitle ?? record.title,
    body: record.privateBody ?? record.body,
    priority: record.priority,
    status: record.status,
    actionRoute: record.actionRoute,
    sourceDate: record.sourceDate,
    challengeDay: record.challengeDay,
    challengeWeek: record.challengeWeek,
    generatedAt: record.generatedAt.toISOString(),
    readAt: record.readAt?.toISOString() ?? null,
    delivery: record.delivery,
  } as const;
}

export async function getNotifications(
  userId: string,
  options: { readonly limit: number; readonly cursor?: string },
) {
  await connectToDatabase();
  const filter: Record<string, unknown> = { userId, status: { $ne: "DISMISSED" } };
  if (options.cursor) {
    if (!mongoose.isValidObjectId(options.cursor)) throw new AppError("VALIDATION_ERROR");
    filter._id = { $lt: options.cursor };
  }
  const [records, unreadCount] = await Promise.all([
    NotificationRecordModel.find(filter)
      .sort({ _id: -1 })
      .limit(options.limit + 1),
    NotificationRecordModel.countDocuments({ userId, status: "UNREAD" }),
  ]);
  const hasMore = records.length > options.limit;
  const page = records.slice(0, options.limit);
  return {
    notifications: page.map(recordDto),
    unreadCount,
    nextCursor: hasMore ? page.at(-1)!._id.toString() : null,
  } as const;
}

export async function getUnreadNotificationCount(userId: string) {
  await connectToDatabase();
  return {
    unreadCount: await NotificationRecordModel.countDocuments({
      userId,
      status: "UNREAD",
    }),
  } as const;
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
  now = new Date(),
) {
  if (!mongoose.isValidObjectId(notificationId)) throw new AppError("VALIDATION_ERROR");
  await connectToDatabase();
  const record = await NotificationRecordModel.findOneAndUpdate(
    { _id: notificationId, userId, status: { $ne: "DISMISSED" } },
    { $set: { status: "READ", readAt: now } },
    { returnDocument: "after" },
  );
  if (!record) throw new AppError("NOTIFICATION_NOT_FOUND");
  return recordDto(record);
}

export async function markAllNotificationsRead(userId: string, now = new Date()) {
  await connectToDatabase();
  const result = await NotificationRecordModel.updateMany(
    { userId, status: "UNREAD" },
    { $set: { status: "READ", readAt: now } },
  );
  return { updatedCount: result.modifiedCount } as const;
}

export async function dismissNotification(
  userId: string,
  notificationId: string,
  now = new Date(),
) {
  if (!mongoose.isValidObjectId(notificationId)) throw new AppError("VALIDATION_ERROR");
  await connectToDatabase();
  const record = await NotificationRecordModel.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { status: "DISMISSED", dismissedAt: now } },
    { returnDocument: "after" },
  );
  if (!record) throw new AppError("NOTIFICATION_NOT_FOUND");
  return { dismissed: true } as const;
}

export type NotificationList = Awaited<ReturnType<typeof getNotifications>>;
export type NotificationPreferencesResult = Awaited<
  ReturnType<typeof getNotificationPreferences>
>;
