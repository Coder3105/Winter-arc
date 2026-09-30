import "server-only";

import type { DailyQuestResponseInput } from "@/lib/validation/daily-quest";
import {
  calculateChallengeDay,
  challengeDayToWeek,
  normalizeCalendarDate,
} from "@/server/calculations";
import {
  type DailyQuestRuleSnapshot,
  type EvaluatedDailyQuest,
} from "@/server/daily-quest/evaluation";
import { evaluateDailyQuestRecord } from "@/server/daily-quest/record-evaluation";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import {
  DailyQuestRecordModel,
  type DailyQuestRecordDocument,
  type DailyQuestResponseDocument,
} from "@/server/models/daily-quest-record";
import { WeightRecordModel } from "@/server/models/weight-record";

import { getProfile } from "./profile-service";
import { reconcileEventNotifications } from "./notification-service";
import { reconcileDailyQuestProgression } from "./progression-service";
import { reconcilePhase9Systems } from "./achievement-reward-service";
import { getWinterArcConfig, type WinterArcConfigDto } from "./winter-arc-service";

export type DailyQuestUnavailableReason =
  | "WINTER_ARC_NOT_ACTIVE"
  | "PROFILE_REQUIRED"
  | "PROTOCOL_NOT_STARTED"
  | "WINTER_ARC_COMPLETE";

export type TodayDailyQuestResult =
  | { readonly kind: "AVAILABLE"; readonly quest: EvaluatedDailyQuest }
  | {
      readonly kind: "UNAVAILABLE";
      readonly reason: DailyQuestUnavailableReason;
      readonly localDate: string | null;
    };

function snapshotEnabledRules(config: WinterArcConfigDto): DailyQuestRuleSnapshot[] {
  return config.rules
    .filter((rule) => rule.enabled && rule.key !== "workout")
    .sort((left, right) => left.order - right.order)
    .map(({ key, name, type, target, unit, requiredFrequency, order }) => ({
      key,
      name,
      type,
      target,
      unit,
      requiredFrequency,
      order,
    }));
}

export { evaluateDailyQuestRecord } from "@/server/daily-quest/record-evaluation";

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function loadQuestContext(userId: string, now: Date) {
  const [profile, config] = await Promise.all([
    getProfile(userId),
    getWinterArcConfig(userId),
  ]);
  if (!profile) {
    return {
      unavailable: {
        kind: "UNAVAILABLE",
        reason: "PROFILE_REQUIRED",
        localDate: null,
      } as const,
    };
  }
  const localDate = normalizeCalendarDate(now, profile.timezone);
  if (!config || config.status !== "ACTIVE") {
    return {
      unavailable: {
        kind: "UNAVAILABLE",
        reason: "WINTER_ARC_NOT_ACTIVE",
        localDate,
      } as const,
    };
  }
  return { profile, config, localDate };
}

export async function getOrCreateTodayDailyQuest(
  userId: string,
  now = new Date(),
): Promise<TodayDailyQuestResult> {
  const context = await loadQuestContext(userId, now);
  if ("unavailable" in context) return context.unavailable;
  const { profile, config, localDate } = context;
  const challenge = calculateChallengeDay({
    startDate: config.startDate,
    currentDate: localDate,
    timezone: profile.timezone,
    durationDays: config.durationDays,
  });
  if (challenge.status !== "ACTIVE") {
    return {
      kind: "UNAVAILABLE",
      reason:
        challenge.status === "NOT_STARTED"
          ? "PROTOCOL_NOT_STARTED"
          : "WINTER_ARC_COMPLETE",
      localDate,
    };
  }
  const week = challengeDayToWeek(challenge.dayNumber, config.durationDays);
  await connectToDatabase();
  await DailyQuestRecordModel.init();
  const filter = {
    userId,
    winterArcConfigId: config.id,
    date: localDate,
  };
  let record: DailyQuestRecordDocument | null;
  try {
    record = await DailyQuestRecordModel.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          ...filter,
          timezone: profile.timezone,
          challengeDay: challenge.dayNumber,
          challengeWeek: week.weekNumber,
          ruleSnapshot: snapshotEnabledRules(config),
          responses: {},
          completedAt: null,
          dailyNote: null,
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
    record = await DailyQuestRecordModel.findOne(filter);
  }
  if (!record) throw new AppError("INTERNAL_ERROR");
  const morningRule = record.ruleSnapshot.find((rule) => rule.key === "morning_weight");
  if (morningRule) {
    const weightExists = Boolean(
      await WeightRecordModel.exists({
        userId,
        winterArcConfigId: config.id,
        date: localDate,
      }),
    );
    const currentResponse = record.responses.get("morning_weight");
    if (weightExists && currentResponse?.booleanValue !== true) {
      record = await DailyQuestRecordModel.findOneAndUpdate(
        { _id: record._id, userId },
        {
          $set: {
            "responses.morning_weight": {
              kind: "BOOLEAN",
              booleanValue: true,
              recordedAt: now,
            },
          },
        },
        { returnDocument: "after", runValidators: true },
      );
    } else if (!weightExists && currentResponse !== undefined) {
      record = await DailyQuestRecordModel.findOneAndUpdate(
        { _id: record._id, userId },
        { $unset: { "responses.morning_weight": "" } },
        { returnDocument: "after", runValidators: true },
      );
    }
    if (!record) throw new AppError("DAILY_QUEST_NOT_FOUND");
  }
  let evaluated = evaluateDailyQuestRecord(record, config.durationDays, localDate);
  if (evaluated.isPerfectDay && !record.completedAt) {
    await DailyQuestRecordModel.updateOne(
      { _id: record._id, userId, completedAt: null },
      { $set: { completedAt: now } },
    );
    evaluated = { ...evaluated, completedAt: now.toISOString() };
  }
  await reconcileDailyQuestProgression(userId, config.id, evaluated, now);
  await reconcilePhase9Systems(userId, now);
  await reconcileEventNotifications(userId, now);
  return {
    kind: "AVAILABLE",
    quest: evaluated,
  };
}

export async function synchronizeTodayMorningWeight(
  userId: string,
  now = new Date(),
): Promise<EvaluatedDailyQuest> {
  const result = await getOrCreateTodayDailyQuest(userId, now);
  if (result.kind === "UNAVAILABLE") throw new AppError("WEIGHT_NOT_AVAILABLE");
  return result.quest;
}

function validateResponse(
  rule: DailyQuestRuleSnapshot,
  value: boolean | number,
  recordedAt: Date,
): DailyQuestResponseDocument {
  if (rule.type === "BOOLEAN" || rule.type === "LOGGING_REQUIREMENT") {
    if (typeof value !== "boolean") throw new AppError("INVALID_RULE_VALUE");
    return { kind: "BOOLEAN", booleanValue: value, recordedAt };
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    (rule.key === "steps" && !Number.isSafeInteger(value))
  ) {
    throw new AppError("INVALID_RULE_VALUE");
  }
  return { kind: "NUMERIC", numericValue: value, recordedAt };
}

export async function updateTodayDailyQuestResponse(
  userId: string,
  input: DailyQuestResponseInput,
  now = new Date(),
): Promise<EvaluatedDailyQuest> {
  const result = await getOrCreateTodayDailyQuest(userId, now);
  if (result.kind === "UNAVAILABLE") {
    throw new AppError(
      result.reason === "WINTER_ARC_NOT_ACTIVE"
        ? "WINTER_ARC_NOT_ACTIVE"
        : "QUEST_NOT_AVAILABLE",
    );
  }
  if (input.key === "morning_weight") throw new AppError("WEIGHT_SOURCE_REQUIRED");
  const rule = result.quest.rules.find((candidate) => candidate.key === input.key);
  if (!rule || rule.state === "NOT_APPLICABLE") throw new AppError("RULE_NOT_FOUND");
  const response = validateResponse(rule, input.value, now);
  const record = await DailyQuestRecordModel.findOneAndUpdate(
    { _id: result.quest.id, userId },
    { $set: { [`responses.${rule.key}`]: response } },
    { returnDocument: "after", runValidators: true },
  );
  if (!record) throw new AppError("DAILY_QUEST_NOT_FOUND");
  let evaluated = evaluateDailyQuestRecord(
    record,
    result.quest.durationDays,
    result.quest.date,
  );
  if (evaluated.isPerfectDay && !record.completedAt) {
    const completedAt = now;
    await DailyQuestRecordModel.updateOne(
      { _id: record._id, userId, completedAt: null },
      { $set: { completedAt } },
    );
    evaluated = { ...evaluated, completedAt: completedAt.toISOString() };
  }
  const config = await getWinterArcConfig(userId);
  if (!config) throw new AppError("WINTER_ARC_NOT_ACTIVE");
  await reconcileDailyQuestProgression(userId, config.id, evaluated, now);
  await reconcilePhase9Systems(userId, now);
  await reconcileEventNotifications(userId, now);
  return evaluated;
}

export async function getDailyQuestByDate(
  userId: string,
  date: string,
  now = new Date(),
): Promise<EvaluatedDailyQuest | null> {
  const context = await loadQuestContext(userId, now);
  if ("unavailable" in context) {
    throw new AppError(
      context.unavailable.reason === "WINTER_ARC_NOT_ACTIVE"
        ? "WINTER_ARC_NOT_ACTIVE"
        : "QUEST_NOT_AVAILABLE",
    );
  }
  const { profile, config, localDate } = context;
  const challenge = calculateChallengeDay({
    startDate: config.startDate,
    currentDate: date,
    timezone: profile.timezone,
    durationDays: config.durationDays,
  });
  if (challenge.status !== "ACTIVE") throw new AppError("QUEST_NOT_AVAILABLE");
  await connectToDatabase();
  const record = await DailyQuestRecordModel.findOne({
    userId,
    winterArcConfigId: config.id,
    date,
  });
  return record ? evaluateDailyQuestRecord(record, config.durationDays, localDate) : null;
}
