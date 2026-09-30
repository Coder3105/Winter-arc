import "server-only";

import type { DailyRuleConfiguration } from "@/features/winter-arc/rules";
import {
  addCalendarDays,
  aggregateCalendarMonth,
  calculateChallengeDay,
  calculatePerfectDayStreak,
  calculateRuleStreaks,
  normalizeCalendarDate,
  summarizeCalendarDay,
  type CalendarDaySummary,
} from "@/server/calculations";
import { connectToDatabase } from "@/server/db/mongoose";
import {
  DailyQuestRecordModel,
  type DailyQuestRecordDocument,
} from "@/server/models/daily-quest-record";
import type { EvaluatedDailyQuest } from "@/server/daily-quest/evaluation";
import { WorkoutRecordModel } from "@/server/models/workout-record";
import { WeightRecordModel } from "@/server/models/weight-record";

import { evaluateDailyQuestRecord } from "./daily-quest-service";
import { getProfile } from "./profile-service";
import { getWinterArcConfig, type WinterArcConfigDto } from "./winter-arc-service";

export type HistoryUnavailableReason = "PROFILE_REQUIRED" | "CONFIGURATION_REQUIRED";

export interface HistoryContext {
  readonly timezone: string;
  readonly currentDate: string;
  readonly config: WinterArcConfigDto;
}

async function loadHistoryContext(
  userId: string,
  now: Date,
): Promise<HistoryContext | HistoryUnavailableReason> {
  const [profile, config] = await Promise.all([
    getProfile(userId),
    getWinterArcConfig(userId),
  ]);
  if (!profile) return "PROFILE_REQUIRED";
  if (!config || config.status !== "ACTIVE") return "CONFIGURATION_REQUIRED";
  return {
    timezone: profile.timezone,
    currentDate: normalizeCalendarDate(now, profile.timezone),
    config,
  };
}

function evaluateRecords(
  records: readonly DailyQuestRecordDocument[],
  context: HistoryContext,
): EvaluatedDailyQuest[] {
  return records.map((record) =>
    evaluateDailyQuestRecord(record, context.config.durationDays, context.currentDate),
  );
}

async function queryRecords(
  userId: string,
  configId: string,
  startDate: string,
  endDate: string,
) {
  await connectToDatabase();
  return DailyQuestRecordModel.find({
    userId,
    winterArcConfigId: configId,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 });
}

async function queryWorkoutRecords(
  userId: string,
  configId: string,
  startDate: string,
  endDate: string,
) {
  await connectToDatabase();
  return WorkoutRecordModel.find({
    userId,
    winterArcConfigId: configId,
    date: { $gte: startDate, $lte: endDate },
    status: "COMPLETED",
  }).sort({ date: 1, completedAt: 1 });
}

async function queryWeightRecords(
  userId: string,
  configId: string,
  startDate: string,
  endDate: string,
) {
  await connectToDatabase();
  return WeightRecordModel.find({
    userId,
    winterArcConfigId: configId,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 });
}

function challengeProjection(context: HistoryContext) {
  const progress = calculateChallengeDay({
    startDate: context.config.startDate,
    currentDate: context.currentDate,
    timezone: context.timezone,
    durationDays: context.config.durationDays,
  });
  return {
    startDate: context.config.startDate,
    endDate: context.config.endDate,
    durationDays: context.config.durationDays,
    status: progress.status,
    currentDay: progress.status === "ACTIVE" ? progress.dayNumber : null,
  } as const;
}

export async function getCalendarMonthHistory(
  userId: string,
  month: string,
  now = new Date(),
) {
  const context = await loadHistoryContext(userId, now);
  if (typeof context === "string") {
    return { kind: "UNAVAILABLE", reason: context, month } as const;
  }
  const emptyMonth = aggregateCalendarMonth({
    month,
    timezone: context.timezone,
    startDate: context.config.startDate,
    durationDays: context.config.durationDays,
    currentInstant: now,
    quests: [],
  });
  const [records, workouts, weights] = await Promise.all([
    queryRecords(userId, context.config.id, emptyMonth.startDate, emptyMonth.endDate),
    queryWorkoutRecords(
      userId,
      context.config.id,
      emptyMonth.startDate,
      emptyMonth.endDate,
    ),
    queryWeightRecords(
      userId,
      context.config.id,
      emptyMonth.startDate,
      emptyMonth.endDate,
    ),
  ]);
  const quests = evaluateRecords(records, context);
  const calendar = aggregateCalendarMonth({
    month,
    timezone: context.timezone,
    startDate: context.config.startDate,
    durationDays: context.config.durationDays,
    currentInstant: now,
    quests,
    workoutDates: workouts.map((workout) => workout.date),
    weights: weights.map((weight) => ({
      date: weight.date,
      weightKg: weight.weightKg,
    })),
  });
  return {
    kind: "AVAILABLE",
    month,
    timezone: context.timezone,
    currentDate: context.currentDate,
    leadingMondaySlots: calendar.leadingMondaySlots,
    challenge: challengeProjection(context),
    days: calendar.days,
  } as const;
}

function enabledDailyRules(rules: readonly DailyRuleConfiguration[]) {
  return rules
    .filter((rule) => rule.enabled && rule.key !== "workout")
    .map(({ key, name, order }) => ({ key, name, order }));
}

export async function getStreakHistory(userId: string, now = new Date()) {
  const context = await loadHistoryContext(userId, now);
  if (typeof context === "string") {
    return { kind: "UNAVAILABLE", reason: context } as const;
  }
  const records = await queryRecords(
    userId,
    context.config.id,
    context.config.startDate,
    context.config.endDate,
  );
  const quests = evaluateRecords(records, context);
  const questByDate = new Map(quests.map((quest) => [quest.date, quest]));
  const days: CalendarDaySummary[] = Array.from(
    { length: context.config.durationDays },
    (_, offset) => {
      const date = addCalendarDays(context.config.startDate, offset);
      return summarizeCalendarDay({
        date,
        currentDate: context.currentDate,
        startDate: context.config.startDate,
        durationDays: context.config.durationDays,
        ...(questByDate.get(date) ? { quest: questByDate.get(date)! } : {}),
      });
    },
  );
  const perfectDay = calculatePerfectDayStreak(days);
  const ruleQuests = quests.map((quest) => ({
    date: quest.date,
    temporalState: days.find((day) => day.date === quest.date)!.temporalState,
    rules: quest.rules.map(({ key, name, order, state }) => ({
      key,
      name,
      order,
      state,
    })),
  }));
  const elapsed = days.filter((day) => day.temporalState !== "FUTURE");
  return {
    kind: "AVAILABLE",
    timezone: context.timezone,
    currentDate: context.currentDate,
    challenge: challengeProjection(context),
    perfectDay,
    rules: calculateRuleStreaks(ruleQuests, enabledDailyRules(context.config.rules)),
    summary: {
      perfectDays: elapsed.filter((day) => day.isPerfectDay).length,
      recordedDays: elapsed.filter((day) => day.recordExists).length,
      missedDays: elapsed.filter((day) => day.calendarState === "MISSED").length,
      elapsedChallengeDays: elapsed.filter((day) => day.relation === "CHALLENGE_DAY")
        .length,
    },
  } as const;
}

export async function getInitialCalendarMonth(
  userId: string,
  now = new Date(),
): Promise<string | null> {
  const context = await loadHistoryContext(userId, now);
  if (typeof context === "string") return null;
  const challenge = calculateChallengeDay({
    startDate: context.config.startDate,
    currentDate: context.currentDate,
    timezone: context.timezone,
    durationDays: context.config.durationDays,
  });
  return (
    challenge.status === "NOT_STARTED"
      ? context.config.startDate
      : challenge.status === "COMPLETED"
        ? context.config.endDate
        : context.currentDate
  ).slice(0, 7);
}
