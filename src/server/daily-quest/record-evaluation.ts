import {
  evaluateDailyQuest,
  type DailyQuestEvaluationInput,
  type DailyQuestResponse,
  type EvaluatedDailyQuest,
} from "./evaluation";
import type {
  DailyQuestRecordDocument,
  DailyQuestResponseDocument,
} from "../models/daily-quest-record";

function responseRecord(
  responses: Map<string, DailyQuestResponseDocument>,
): Record<string, DailyQuestResponse> {
  return Object.fromEntries(
    [...responses.entries()].map(([key, response]) => [
      key,
      {
        kind: response.kind,
        ...(response.booleanValue === undefined
          ? {}
          : { booleanValue: response.booleanValue }),
        ...(response.numericValue === undefined
          ? {}
          : { numericValue: response.numericValue }),
        recordedAt: response.recordedAt.toISOString(),
      },
    ]),
  );
}

export function evaluateDailyQuestRecord(
  record: DailyQuestRecordDocument,
  durationDays: number,
  currentLocalDate: string,
): EvaluatedDailyQuest {
  const input: DailyQuestEvaluationInput = {
    id: record._id.toString(),
    date: record.date,
    timezone: record.timezone,
    challengeDay: record.challengeDay,
    challengeWeek: record.challengeWeek,
    durationDays,
    rules: record.ruleSnapshot.map((rule) => ({
      key: rule.key,
      name: rule.name,
      type: rule.type,
      target: rule.target,
      unit: rule.unit,
      requiredFrequency: rule.requiredFrequency,
      order: rule.order,
    })),
    responses: responseRecord(record.responses),
    currentLocalDate,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
  return evaluateDailyQuest(input);
}
