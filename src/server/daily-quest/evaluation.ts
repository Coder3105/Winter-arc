import type { RuleType } from "@/features/winter-arc/rules";
import {
  calculateCompliance,
  evaluateBooleanRule,
  evaluateHydration,
  evaluateMinimumSleepTarget,
  evaluateNumericMinimum,
  evaluateSteps,
  type DailyRuleState,
} from "@/server/calculations";

export interface DailyQuestRuleSnapshot {
  readonly key: string;
  readonly name: string;
  readonly type: RuleType;
  readonly target: number | null;
  readonly unit: string | null;
  readonly requiredFrequency: number;
  readonly order: number;
}

export interface DailyQuestResponse {
  readonly kind: "BOOLEAN" | "NUMERIC";
  readonly booleanValue?: boolean;
  readonly numericValue?: number;
  readonly recordedAt: string;
}

export interface DailyQuestEvaluationInput {
  readonly id: string;
  readonly date: string;
  readonly timezone: string;
  readonly challengeDay: number;
  readonly challengeWeek: number;
  readonly durationDays: number;
  readonly rules: readonly DailyQuestRuleSnapshot[];
  readonly responses: Readonly<Record<string, DailyQuestResponse>>;
  readonly currentLocalDate: string;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EvaluatedDailyQuestRule extends DailyQuestRuleSnapshot {
  readonly actual: boolean | number | null;
  readonly state: DailyRuleState;
  readonly rawCompletionPercent: number | null;
  readonly completionPercent: number | null;
}

function evaluateRule(
  rule: DailyQuestRuleSnapshot,
  response: DailyQuestResponse | undefined,
): EvaluatedDailyQuestRule {
  if (rule.type === "BOOLEAN" || rule.type === "LOGGING_REQUIREMENT") {
    const actual = response?.kind === "BOOLEAN" ? (response.booleanValue ?? null) : null;
    const result = evaluateBooleanRule(actual);
    return {
      ...rule,
      actual,
      state: result.state,
      rawCompletionPercent: actual === null ? null : actual ? 100 : 0,
      completionPercent: actual === null ? null : actual ? 100 : 0,
    };
  }

  const actual = response?.kind === "NUMERIC" ? (response.numericValue ?? null) : null;
  const target = rule.target;
  if (target === null) {
    return {
      ...rule,
      actual,
      state: "NOT_APPLICABLE",
      rawCompletionPercent: null,
      completionPercent: null,
    };
  }
  const result =
    rule.key === "sleep"
      ? evaluateMinimumSleepTarget(actual, target)
      : rule.key === "hydration"
        ? evaluateHydration(actual, target)
        : rule.key === "steps"
          ? evaluateSteps(actual, target)
          : evaluateNumericMinimum(actual, target);
  return {
    ...rule,
    actual,
    state: result.state,
    rawCompletionPercent: result.rawPercent,
    completionPercent: result.completionPercent,
  };
}

export function evaluateDailyQuest(input: DailyQuestEvaluationInput) {
  const rules = [...input.rules]
    .sort((left, right) => left.order - right.order)
    .map((rule) => evaluateRule(rule, input.responses[rule.key]));
  const applicable = rules.filter((rule) => rule.state !== "NOT_APPLICABLE");
  const completedRequiredRules = applicable.filter(
    (rule) => rule.state === "PASS",
  ).length;
  const totalRequiredRules = applicable.length;
  const completion = calculateCompliance(completedRequiredRules, totalRequiredRules);
  const hasRecordedData = applicable.some((rule) => rule.state !== "NOT_RECORDED");
  const isPerfectDay =
    totalRequiredRules > 0 && completedRequiredRules === totalRequiredRules;
  const status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "MISSED" = isPerfectDay
    ? "COMPLETE"
    : input.date < input.currentLocalDate
      ? "MISSED"
      : hasRecordedData
        ? "IN_PROGRESS"
        : "NOT_STARTED";

  return {
    id: input.id,
    date: input.date,
    timezone: input.timezone,
    challengeDay: input.challengeDay,
    challengeWeek: input.challengeWeek,
    durationDays: input.durationDays,
    status,
    completedRequiredRules,
    totalRequiredRules,
    rawCompletionPercent: completion.rawPercent,
    completionPercent: completion.clampedPercent,
    isPerfectDay,
    rules,
    completedAt: input.completedAt,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  } as const;
}

export type EvaluatedDailyQuest = ReturnType<typeof evaluateDailyQuest>;
