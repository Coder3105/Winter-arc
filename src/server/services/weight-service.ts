import "server-only";

import type { WeightInput } from "@/lib/validation/weight";
import {
  buildWeightAnalytics,
  calculateChallengeDay,
  calendarDayIndex,
  challengeDayToWeek,
  normalizeCalendarDate,
} from "@/server/calculations";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import {
  WeightRecordModel,
  type WeightRecordDocument,
} from "@/server/models/weight-record";

import {
  getBaselineAssessment,
  getLatestAssessment,
  listBodyCompositionAssessments,
} from "./body-composition-service";
import { synchronizeTodayMorningWeight } from "./daily-quest-service";
import { getProfile } from "./profile-service";
import { getWinterArcConfig, type WinterArcConfigDto } from "./winter-arc-service";

export type WeightUnavailableReason =
  | "PROFILE_REQUIRED"
  | "CONFIGURATION_REQUIRED"
  | "PROTOCOL_NOT_STARTED"
  | "CHALLENGE_COMPLETED";

export interface WeightDto {
  readonly id: string;
  readonly date: string;
  readonly timezone: string;
  readonly challengeDay: number;
  readonly challengeWeek: number;
  readonly weightKg: number;
  readonly source: WeightRecordDocument["source"];
  readonly recordedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface WeightContext {
  readonly timezone: string;
  readonly currentDate: string;
  readonly config: WinterArcConfigDto;
}

export function toWeightDto(record: WeightRecordDocument): WeightDto {
  return {
    id: record._id.toString(),
    date: record.date,
    timezone: record.timezone,
    challengeDay: record.challengeDay,
    challengeWeek: record.challengeWeek,
    weightKg: record.weightKg,
    source: record.source,
    recordedAt: record.recordedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function loadBaseContext(
  userId: string,
  now: Date,
): Promise<WeightContext | WeightUnavailableReason> {
  const [profile, config] = await Promise.all([
    getProfile(userId),
    getWinterArcConfig(userId),
  ]);
  if (!profile) return "PROFILE_REQUIRED";
  if (!config) return "CONFIGURATION_REQUIRED";
  return {
    timezone: profile.timezone,
    currentDate: normalizeCalendarDate(now, profile.timezone),
    config,
  };
}

async function loadTodayContext(userId: string, now: Date) {
  const context = await loadBaseContext(userId, now);
  if (typeof context === "string") return context;
  if (context.config.status !== "ACTIVE") return "CONFIGURATION_REQUIRED" as const;
  const challenge = calculateChallengeDay({
    startDate: context.config.startDate,
    currentDate: context.currentDate,
    timezone: context.timezone,
    durationDays: context.config.durationDays,
  });
  if (challenge.status === "NOT_STARTED") return "PROTOCOL_NOT_STARTED" as const;
  if (challenge.status === "COMPLETED") return "CHALLENGE_COMPLETED" as const;
  return { ...context, challenge };
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function getTodayWeight(userId: string, now = new Date()) {
  const context = await loadTodayContext(userId, now);
  if (typeof context === "string") {
    return { kind: "UNAVAILABLE", reason: context } as const;
  }
  await connectToDatabase();
  const record = await WeightRecordModel.findOne({
    userId,
    winterArcConfigId: context.config.id,
    date: context.currentDate,
  });
  return {
    kind: "AVAILABLE",
    localDate: context.currentDate,
    weight: record ? toWeightDto(record) : null,
  } as const;
}

export async function upsertTodayWeight(
  userId: string,
  input: WeightInput,
  now = new Date(),
) {
  const context = await loadTodayContext(userId, now);
  if (typeof context === "string") throw new AppError("WEIGHT_NOT_AVAILABLE");
  const week = challengeDayToWeek(
    context.challenge.dayNumber,
    context.config.durationDays,
  );
  await connectToDatabase();
  await WeightRecordModel.init();
  const filter = {
    userId,
    winterArcConfigId: context.config.id,
    date: context.currentDate,
  };
  let record: WeightRecordDocument | null;
  try {
    record = await WeightRecordModel.findOneAndUpdate(
      filter,
      {
        $set: { weightKg: input.weightKg },
        $setOnInsert: {
          ...filter,
          timezone: context.timezone,
          challengeDay: context.challenge.dayNumber,
          challengeWeek: week.weekNumber,
          source: "MANUAL",
          recordedAt: now,
        },
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
    record = await WeightRecordModel.findOneAndUpdate(
      filter,
      { $set: { weightKg: input.weightKg } },
      { returnDocument: "after", runValidators: true },
    );
  }
  if (!record) throw new AppError("INTERNAL_ERROR");
  const quest = await synchronizeTodayMorningWeight(userId, now);
  return { weight: toWeightDto(record), quest } as const;
}

export async function deleteTodayWeight(userId: string, now = new Date()) {
  const context = await loadTodayContext(userId, now);
  if (typeof context === "string") throw new AppError("WEIGHT_NOT_AVAILABLE");
  await connectToDatabase();
  const deleted = await WeightRecordModel.findOneAndDelete({
    userId,
    winterArcConfigId: context.config.id,
    date: context.currentDate,
  });
  const quest = await synchronizeTodayMorningWeight(userId, now);
  if (!deleted) throw new AppError("WEIGHT_NOT_FOUND");
  return { deleted: toWeightDto(deleted), quest } as const;
}

export async function getWeightHistory(
  userId: string,
  from: string,
  to: string,
  now = new Date(),
) {
  const context = await loadBaseContext(userId, now);
  if (typeof context === "string") {
    return { kind: "UNAVAILABLE", reason: context } as const;
  }
  if (calendarDayIndex(to) - calendarDayIndex(from) > 365)
    throw new AppError("VALIDATION_ERROR");
  await connectToDatabase();
  const records = await WeightRecordModel.find({
    userId,
    winterArcConfigId: context.config.id,
    date: { $gte: from, $lte: to },
  }).sort({ date: 1 });
  return {
    kind: "AVAILABLE",
    timezone: context.timezone,
    from,
    to,
    weights: records.map(toWeightDto),
  } as const;
}

export async function getWeightAnalytics(userId: string, now = new Date()) {
  const context = await loadBaseContext(userId, now);
  if (typeof context === "string") {
    return { kind: "UNAVAILABLE", reason: context } as const;
  }
  await connectToDatabase();
  const [records, baseline, latestAssessment, assessments] = await Promise.all([
    WeightRecordModel.find({
      userId,
      winterArcConfigId: context.config.id,
      date: { $gte: context.config.startDate, $lte: context.config.endDate },
    }).sort({ date: 1 }),
    getBaselineAssessment(userId),
    getLatestAssessment(userId),
    listBodyCompositionAssessments(userId),
  ]);
  const analytics = buildWeightAnalytics({
    timezone: context.timezone,
    currentDate: context.currentDate,
    targetWeightKg: context.config.targetWeightKg,
    records: records.map((record) => ({
      date: record.date,
      weightKg: record.weightKg,
      recordedAt: record.recordedAt.toISOString(),
      source: record.source,
    })),
    baseline,
    latestAssessment,
    assessments,
  });
  const challenge = calculateChallengeDay({
    startDate: context.config.startDate,
    currentDate: context.currentDate,
    timezone: context.timezone,
    durationDays: context.config.durationDays,
  });
  return {
    kind: "AVAILABLE",
    challenge: {
      status: challenge.status,
      dayNumber: challenge.dayNumber,
      durationDays: context.config.durationDays,
    },
    ...analytics,
  } as const;
}
