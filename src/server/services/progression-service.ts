import "server-only";

import mongoose from "mongoose";

import {
  calculateChallengeDay,
  calculateLevelProgress,
  challengeDayToWeek,
  getNextRank,
  normalizeCalendarDate,
} from "@/server/calculations";
import type { EvaluatedDailyQuest } from "@/server/daily-quest/evaluation";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import { DailyQuestRecordModel } from "@/server/models/daily-quest-record";
import {
  ProgressionEventModel,
  type ProgressionEventDocument,
  type ProgressionEventType,
  type ProgressionSourceType,
} from "@/server/models/progression-event";
import { WorkoutRecordModel } from "@/server/models/workout-record";
import {
  calculateDailyQuestPotentialXp,
  getDailyRuleXp,
  PERFECT_DAY_XP,
  PROGRESSION_RULE_VERSION,
  WEEKLY_WORKOUT_XP,
  WORKOUT_DAY_XP,
} from "@/lib/progression/xp-policy";

import { getProfile } from "./profile-service";
import { getPhase9StatusSummary } from "./achievement-reward-service";
import { getWinterArcConfig, type WinterArcConfigDto } from "./winter-arc-service";

interface EventIdentity {
  readonly sourceType: ProgressionSourceType;
  readonly sourceKey: string;
  readonly eventType: ProgressionEventType;
  readonly xp: number;
  readonly sourceDocumentId?: string;
  readonly sourceDate?: string;
  readonly challengeDay?: number;
  readonly challengeWeek?: number;
}

export type ProgressionUnavailableReason = "PROFILE_REQUIRED" | "CONFIGURATION_REQUIRED";

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function convergeEvent(
  userId: string,
  winterArcConfigId: string,
  event: EventIdentity,
  active: boolean,
  now: Date,
) {
  const filter = {
    userId,
    winterArcConfigId,
    sourceType: event.sourceType,
    sourceKey: event.sourceKey,
  };
  if (!active) {
    return ProgressionEventModel.findOneAndUpdate(
      { ...filter, status: "ACTIVE" },
      { $set: { status: "REVOKED", revokedAt: now } },
      { returnDocument: "after" },
    );
  }

  const sourceDocumentId =
    event.sourceDocumentId && mongoose.isValidObjectId(event.sourceDocumentId)
      ? event.sourceDocumentId
      : null;
  const insertion = {
    ...filter,
    sourceDocumentId,
    sourceDate: event.sourceDate ?? null,
    challengeDay: event.challengeDay ?? null,
    challengeWeek: event.challengeWeek ?? null,
    eventType: event.eventType,
    xp: event.xp,
    ruleVersion: PROGRESSION_RULE_VERSION,
    earnedAt: now,
  };
  try {
    return await ProgressionEventModel.findOneAndUpdate(
      filter,
      {
        $setOnInsert: insertion,
        $set: { status: "ACTIVE", revokedAt: null },
      },
      {
        upsert: true,
        returnDocument: "after",
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    return ProgressionEventModel.findOneAndUpdate(
      filter,
      { $set: { status: "ACTIVE", revokedAt: null } },
      { returnDocument: "after", runValidators: true },
    );
  }
}

export async function reconcileDailyQuestProgression(
  userId: string,
  winterArcConfigId: string,
  quest: EvaluatedDailyQuest,
  now = new Date(),
) {
  await connectToDatabase();
  await ProgressionEventModel.init();
  const events = quest.rules.map((rule) =>
    convergeEvent(
      userId,
      winterArcConfigId,
      {
        sourceType: "DAILY_RULE",
        sourceKey: `daily-rule:${quest.date}:${rule.key}`,
        sourceDocumentId: quest.id,
        sourceDate: quest.date,
        challengeDay: quest.challengeDay,
        challengeWeek: quest.challengeWeek,
        eventType: "DAILY_RULE_PASSED",
        xp: getDailyRuleXp(rule.key),
      },
      rule.state === "PASS",
      now,
    ),
  );
  events.push(
    convergeEvent(
      userId,
      winterArcConfigId,
      {
        sourceType: "PERFECT_DAY",
        sourceKey: `perfect-day:${quest.date}`,
        sourceDocumentId: quest.id,
        sourceDate: quest.date,
        challengeDay: quest.challengeDay,
        challengeWeek: quest.challengeWeek,
        eventType: "PERFECT_DAY_COMPLETED",
        xp: PERFECT_DAY_XP,
      },
      quest.isPerfectDay,
      now,
    ),
  );
  await Promise.all(events);
}

export async function reconcileWorkoutDayProgression(
  userId: string,
  config: WinterArcConfigDto,
  date: string,
  challengeDay: number,
  challengeWeek: number,
  now = new Date(),
) {
  await connectToDatabase();
  await ProgressionEventModel.init();
  const sessionExists = Boolean(
    await WorkoutRecordModel.exists({
      userId,
      winterArcConfigId: config.id,
      date,
      status: "COMPLETED",
    }),
  );
  await convergeEvent(
    userId,
    config.id,
    {
      sourceType: "WORKOUT_DAY",
      sourceKey: `workout-day:${date}`,
      sourceDate: date,
      challengeDay,
      challengeWeek,
      eventType: "WORKOUT_DAY_COMPLETED",
      xp: WORKOUT_DAY_XP,
    },
    sessionExists,
    now,
  );
}

export async function reconcileWorkoutWeekProgression(
  userId: string,
  config: WinterArcConfigDto,
  challengeWeek: number,
  sourceDate: string,
  now = new Date(),
) {
  await connectToDatabase();
  await ProgressionEventModel.init();
  const records = await WorkoutRecordModel.find({
    userId,
    winterArcConfigId: config.id,
    challengeWeek,
    status: "COMPLETED",
  });
  const distinctDates = new Set(records.map((record) => record.date));
  await convergeEvent(
    userId,
    config.id,
    {
      sourceType: "WEEKLY_WORKOUT",
      sourceKey: `workout-week:${challengeWeek}:secured`,
      sourceDate,
      challengeWeek,
      eventType: "WEEKLY_WORKOUT_SECURED",
      xp: WEEKLY_WORKOUT_XP,
    },
    distinctDates.size >= config.weeklyWorkoutTarget,
    now,
  );
}

function sumXp(events: readonly ProgressionEventDocument[]): number {
  const total = events.reduce((sum, event) => sum + event.xp, 0);
  if (!Number.isSafeInteger(total) || total < 0) throw new AppError("INTERNAL_ERROR");
  return total;
}

function eventLabel(event: ProgressionEventDocument): string {
  if (event.sourceType === "PERFECT_DAY") return "PERFECT DAY";
  if (event.sourceType === "WORKOUT_DAY") return "WORKOUT DAY";
  if (event.sourceType === "WEEKLY_WORKOUT") return "WEEKLY MISSION";
  const key = event.sourceKey.split(":").at(-1) ?? "DAILY RULE";
  return key.replaceAll("_", " ").toUpperCase();
}

export async function getProgressionSummary(userId: string, now = new Date()) {
  const [profile, config] = await Promise.all([
    getProfile(userId),
    getWinterArcConfig(userId),
  ]);
  if (!profile) return { kind: "UNAVAILABLE", reason: "PROFILE_REQUIRED" } as const;
  if (!config || config.status !== "ACTIVE")
    return { kind: "UNAVAILABLE", reason: "CONFIGURATION_REQUIRED" } as const;

  const localDate = normalizeCalendarDate(now, profile.timezone);
  const challenge = calculateChallengeDay({
    startDate: config.startDate,
    currentDate: localDate,
    timezone: profile.timezone,
    durationDays: config.durationDays,
  });
  await connectToDatabase();
  const [events, todayQuest, systemRecord] = await Promise.all([
    ProgressionEventModel.find({
      userId,
      winterArcConfigId: config.id,
      status: "ACTIVE",
    }).sort({ earnedAt: -1, _id: -1 }),
    DailyQuestRecordModel.findOne({
      userId,
      winterArcConfigId: config.id,
      date: localDate,
    }),
    getPhase9StatusSummary(userId, config.id),
  ]);
  const totalXp = sumXp(events);
  const level = calculateLevelProgress(totalXp);
  const rank = getNextRank(level.level);
  const activeWeek =
    challenge.status === "ACTIVE"
      ? challengeDayToWeek(challenge.dayNumber, config.durationDays).weekNumber
      : null;
  const todayEvents = events.filter((event) => event.sourceDate === localDate);
  const dailyQuestEvents = todayEvents.filter(
    (event) => event.sourceType === "DAILY_RULE" || event.sourceType === "PERFECT_DAY",
  );
  const potentialRuleKeys =
    todayQuest?.ruleSnapshot
      .filter(
        (rule) =>
          rule.type !== "NUMERIC_MINIMUM" ||
          (rule.target !== null && Number.isFinite(rule.target) && rule.target > 0),
      )
      .map((rule) => rule.key) ?? [];

  return {
    kind: "AVAILABLE",
    localDate,
    challengeStatus: challenge.status,
    totalXp,
    level: {
      current: level.level,
      currentLevelStartXp: level.currentLevelStartXp,
      nextLevelXp: level.nextLevelXp,
      xpIntoLevel: level.xpIntoCurrentLevel,
      xpRequired: level.xpRequiredForNextLevel,
      xpRemaining: level.xpRequiredForNextLevel - level.xpIntoCurrentLevel,
      progressPercent: level.levelProgressPercent,
      nextLevel: level.level + 1,
    },
    rank: {
      current: rank.currentRank,
      next: rank.nextRank,
      levelsUntilNextRank: rank.levelsUntilNextRank,
    },
    systemRecord,
    today: {
      totalXp: sumXp(todayEvents),
      dailyQuestXp: sumXp(dailyQuestEvents),
      maxAvailableDailyQuestXp: calculateDailyQuestPotentialXp(potentialRuleKeys),
      workoutDayXp: sumXp(
        todayEvents.filter((event) => event.sourceType === "WORKOUT_DAY"),
      ),
    },
    week: {
      challengeWeek: activeWeek,
      xp:
        activeWeek === null
          ? 0
          : sumXp(events.filter((event) => event.challengeWeek === activeWeek)),
    },
    breakdown: {
      dailyRules: sumXp(events.filter((event) => event.sourceType === "DAILY_RULE")),
      perfectDays: sumXp(events.filter((event) => event.sourceType === "PERFECT_DAY")),
      workoutDays: sumXp(events.filter((event) => event.sourceType === "WORKOUT_DAY")),
      weeklyWorkoutBonuses: sumXp(
        events.filter((event) => event.sourceType === "WEEKLY_WORKOUT"),
      ),
    },
    recentEvents: events.slice(0, 12).map((event) => ({
      sourceType: event.sourceType,
      eventType: event.eventType,
      label: eventLabel(event),
      xp: event.xp,
      sourceDate: event.sourceDate,
      challengeDay: event.challengeDay,
      challengeWeek: event.challengeWeek,
      earnedAt: event.earnedAt.toISOString(),
    })),
  } as const;
}

export type ProgressionSummary = Awaited<ReturnType<typeof getProgressionSummary>>;
