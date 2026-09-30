import { CalculationError } from "../common/validation";

export const ARC_SCORE_POLICY_VERSION = 1;
export const WEEKLY_REPORT_POLICY_VERSION = 1;

export type SystemEvaluationLabel = "EXCEPTIONAL" | "STRONG" | "STEADY" | "INCOMPLETE";
export type ReportRuleState = "PASS" | "FAIL" | "NOT_RECORDED" | "NOT_APPLICABLE";

export interface ReportRuleInput {
  readonly key: string;
  readonly name: string;
  readonly order: number;
  readonly state: ReportRuleState;
}

export interface ReportDayInput {
  readonly date: string;
  readonly challengeDay: number;
  readonly recordExists: boolean;
  readonly completionPercent: number | null;
  readonly isPerfectDay: boolean;
  readonly rules: readonly ReportRuleInput[];
  readonly workoutSessionCount: number;
  readonly weightKg: number | null;
  readonly xpEarned: number;
  readonly isToday: boolean;
}

function percent(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw new CalculationError(field, "must be finite and between 0 and 100.");
  return value;
}

export function calculateArcScore({
  dailyDisciplinePercent,
  workoutCompletionPercent,
}: {
  readonly dailyDisciplinePercent: number | null;
  readonly workoutCompletionPercent: number | null;
}) {
  if (dailyDisciplinePercent === null) return null;
  if (workoutCompletionPercent === null)
    throw new CalculationError("workoutCompletionPercent", "is required.");
  return (
    percent(dailyDisciplinePercent, "dailyDisciplinePercent") * 0.75 +
    percent(workoutCompletionPercent, "workoutCompletionPercent") * 0.25
  );
}

export function calculateWorkoutScoreComponent(
  completedWorkoutDays: number,
  requiredWorkoutDays: number,
) {
  if (!Number.isSafeInteger(completedWorkoutDays) || completedWorkoutDays < 0)
    throw new CalculationError("completedWorkoutDays", "must be a nonnegative integer.");
  if (!Number.isSafeInteger(requiredWorkoutDays) || requiredWorkoutDays <= 0)
    throw new CalculationError("requiredWorkoutDays", "must be a positive integer.");
  return Math.min((completedWorkoutDays / requiredWorkoutDays) * 100, 100);
}

export function getSystemEvaluationLabel(score: number): SystemEvaluationLabel {
  percent(score, "score");
  if (score >= 90) return "EXCEPTIONAL";
  if (score >= 75) return "STRONG";
  if (score >= 60) return "STEADY";
  return "INCOMPLETE";
}

export function calculateDailyDiscipline(days: readonly ReportDayInput[]) {
  if (days.length === 0)
    return {
      elapsedDays: 0,
      recordedDays: 0,
      missedDays: 0,
      partialDays: 0,
      perfectDays: 0,
      dailyDisciplinePercent: null,
      perfectDayRate: null,
    } as const;
  const completion = days.map((day) =>
    day.recordExists ? percent(day.completionPercent ?? 0, "completionPercent") : 0,
  );
  const perfectDays = days.filter((day) => day.isPerfectDay).length;
  return {
    elapsedDays: days.length,
    recordedDays: days.filter((day) => day.recordExists).length,
    missedDays: days.filter((day) => !day.recordExists).length,
    partialDays: days.filter((day) => day.recordExists && !day.isPerfectDay).length,
    perfectDays,
    dailyDisciplinePercent:
      completion.reduce((sum, value) => sum + value, 0) / completion.length,
    perfectDayRate: (perfectDays / days.length) * 100,
  } as const;
}

export function calculateWeeklyRuleMetrics(days: readonly ReportDayInput[]) {
  const rules = new Map<
    string,
    {
      key: string;
      name: string;
      order: number;
      passed: number;
      failed: number;
      notRecorded: number;
      notApplicable: number;
    }
  >();
  for (const day of days) {
    for (const rule of day.rules) {
      const item = rules.get(rule.key) ?? {
        key: rule.key,
        name: rule.name,
        order: rule.order,
        passed: 0,
        failed: 0,
        notRecorded: 0,
        notApplicable: 0,
      };
      item.order = Math.min(item.order, rule.order);
      if (rule.state === "PASS") item.passed += 1;
      else if (rule.state === "FAIL") item.failed += 1;
      else if (rule.state === "NOT_RECORDED") item.notRecorded += 1;
      else item.notApplicable += 1;
      rules.set(rule.key, item);
    }
  }
  return [...rules.values()]
    .map((rule) => {
      const eligible = rule.passed + rule.failed + rule.notRecorded;
      return {
        ...rule,
        eligible,
        compliancePercent: eligible === 0 ? null : (rule.passed / eligible) * 100,
      };
    })
    .sort((left, right) => left.order - right.order || left.key.localeCompare(right.key));
}

export function rankWeeklyRules(
  rules: readonly ReturnType<typeof calculateWeeklyRuleMetrics>[number][],
) {
  const eligible = rules.filter((rule) => rule.compliancePercent !== null);
  if (!eligible.length) return { strongestRules: [], attentionRules: [] } as const;
  const highest = Math.max(...eligible.map((rule) => rule.compliancePercent!));
  const lowest = Math.min(...eligible.map((rule) => rule.compliancePercent!));
  return {
    strongestRules: eligible.filter((rule) => rule.compliancePercent === highest),
    attentionRules: eligible.filter((rule) => rule.compliancePercent === lowest),
  } as const;
}

export interface WeeklyComparisonSource {
  readonly arcScore: number | null;
  readonly dailyDisciplinePercent: number | null;
  readonly perfectDays: number;
  readonly workoutDays: number;
  readonly xpEarned: number;
  readonly averageWeightKg: number | null;
}

function delta(current: number | null, previous: number | null) {
  return current === null || previous === null ? null : current - previous;
}

export function compareWeeklyReports(
  current: WeeklyComparisonSource,
  previous: WeeklyComparisonSource | null,
) {
  if (!previous)
    return {
      previousArcScore: null,
      arcScoreDelta: null,
      dailyDisciplineDelta: null,
      perfectDaysDelta: null,
      workoutDaysDelta: null,
      xpDelta: null,
      weightAverageDelta: null,
    } as const;
  return {
    previousArcScore: previous.arcScore,
    arcScoreDelta: delta(current.arcScore, previous.arcScore),
    dailyDisciplineDelta: delta(
      current.dailyDisciplinePercent,
      previous.dailyDisciplinePercent,
    ),
    perfectDaysDelta: current.perfectDays - previous.perfectDays,
    workoutDaysDelta: current.workoutDays - previous.workoutDays,
    xpDelta: current.xpEarned - previous.xpEarned,
    weightAverageDelta: delta(current.averageWeightKg, previous.averageWeightKg),
  } as const;
}

export function generateSystemEvaluation({
  score,
  daily,
  strongestRules,
  attentionRules,
  workoutSecured,
  requiredWorkoutDays,
  weightSufficient,
  activeRecovery,
}: {
  readonly score: number | null;
  readonly daily: ReturnType<typeof calculateDailyDiscipline>;
  readonly strongestRules: readonly { readonly name: string }[];
  readonly attentionRules: readonly { readonly name: string }[];
  readonly workoutSecured: boolean;
  readonly requiredWorkoutDays: number;
  readonly weightSufficient: boolean;
  readonly activeRecovery: boolean;
}) {
  const label = score === null ? null : getSystemEvaluationLabel(score);
  const observations = [
    `${daily.perfectDays} of ${daily.elapsedDays} elapsed challenge days were Perfect.`,
    workoutSecured
      ? `Weekly workout mission was secured at ${requiredWorkoutDays}/${requiredWorkoutDays} days.`
      : `Weekly workout mission remains below the configured ${requiredWorkoutDays}-day target.`,
    strongestRules.length
      ? `${strongestRules.map((rule) => rule.name).join(" and ")} had the highest recorded rule compliance.`
      : "No rule-specific compliance data was available.",
    ...(attentionRules.length
      ? [
          `${attentionRules.map((rule) => rule.name).join(" and ")} had the lowest recorded rule compliance.`,
        ]
      : []),
    weightSufficient
      ? "Weight records were sufficient for a weekly average."
      : "Weight trend data was insufficient this week.",
  ];
  const focus = [
    ...(attentionRules.length
      ? [
          `Improve consistency on ${attentionRules.map((rule) => rule.name).join(" and ")}.`,
        ]
      : ["Record daily protocol data consistently."]),
    `Complete the configured ${requiredWorkoutDays} training days.`,
    ...(activeRecovery
      ? ["Clear active Recovery Protocols using their normal requirement."]
      : strongestRules.length
        ? [`Maintain ${strongestRules[0]!.name} consistency.`]
        : []),
  ].slice(0, 3);
  return { label, observations, nextWeekFocus: focus } as const;
}
