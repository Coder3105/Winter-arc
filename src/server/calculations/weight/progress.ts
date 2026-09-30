import { addCalendarDays } from "../common/calendar";
import { compareBodyComposition } from "../body/body-composition";
import { describeWeightChange, calculateWeightChangePercent } from "./change";
import { calculateGoalProgress } from "./goal-progress";
import {
  calculateRollingWeightAverage,
  compareWeeklyWeightAverages,
} from "./moving-average";
import { calculateWeightTrend } from "./trend";
import type { WeightDataPoint } from "./data";

export type WeightGraphRange = "7D" | "30D" | "90D" | "ALL";

export interface WeightAssessmentInput {
  readonly id: string;
  readonly source: string;
  readonly assessmentDate: string;
  readonly isBaseline: boolean;
  readonly measurements: {
    readonly weightKg: number;
    readonly percentBodyFat: number;
    readonly bodyFatMassKg: number;
    readonly fatFreeMassKg: number;
    readonly skeletalMuscleMassKg: number;
    readonly visceralFatLevel: number;
    readonly waistHipRatio: number;
  };
}

export interface WeightAnalyticsInput {
  readonly timezone: string;
  readonly currentDate: string;
  readonly targetWeightKg: number | null;
  readonly records: readonly (WeightDataPoint & {
    readonly recordedAt: string;
    readonly source: "MANUAL" | "BODY_COMPOSITION";
  })[];
  readonly baseline: WeightAssessmentInput | null;
  readonly latestAssessment: WeightAssessmentInput | null;
  readonly assessments: readonly WeightAssessmentInput[];
}

function assessmentSummary(assessment: WeightAssessmentInput) {
  const measurements = assessment.measurements;
  return {
    id: assessment.id,
    date: assessment.assessmentDate.slice(0, 10),
    source: assessment.source,
    isBaseline: assessment.isBaseline,
    measurements: {
      weightKg: measurements.weightKg,
      percentBodyFat: measurements.percentBodyFat,
      bodyFatMassKg: measurements.bodyFatMassKg,
      fatFreeMassKg: measurements.fatFreeMassKg,
      skeletalMuscleMassKg: measurements.skeletalMuscleMassKg,
      visceralFatLevel: measurements.visceralFatLevel,
      waistHipRatio: measurements.waistHipRatio,
    },
  };
}

function graphStart(range: WeightGraphRange, currentDate: string) {
  if (range === "ALL") return null;
  return addCalendarDays(currentDate, -{ "7D": 6, "30D": 29, "90D": 89 }[range]);
}

export function buildWeightAnalytics(input: WeightAnalyticsInput) {
  const points = input.records.map(({ date, weightKg }) => ({ date, weightKg }));
  const latestRecord = input.records.at(-1) ?? null;
  const latest = latestRecord
    ? {
        date: String(latestRecord.date),
        weightKg: latestRecord.weightKg,
        source: "WEIGHT_RECORD" as const,
      }
    : input.latestAssessment
      ? {
          date: input.latestAssessment.assessmentDate.slice(0, 10),
          weightKg: input.latestAssessment.measurements.weightKg,
          source: "BODY_COMPOSITION_ASSESSMENT" as const,
        }
      : null;
  const baseline = input.baseline
    ? {
        date: input.baseline.assessmentDate.slice(0, 10),
        weightKg: input.baseline.measurements.weightKg,
        source: input.baseline.source,
      }
    : null;
  const change =
    baseline && latest
      ? {
          ...describeWeightChange(baseline.weightKg, latest.weightKg),
          deltaPercent: calculateWeightChangePercent(baseline.weightKg, latest.weightKg),
        }
      : null;
  const goal =
    baseline && latest
      ? {
          targetWeightKg: input.targetWeightKg,
          ...calculateGoalProgress({
            startingWeightKg: baseline.weightKg,
            currentWeightKg: latest.weightKg,
            targetWeightKg: input.targetWeightKg,
          }),
        }
      : {
          targetWeightKg: input.targetWeightKg,
          rawPercent: null,
          clampedPercent: null,
          status:
            input.targetWeightKg === null
              ? ("NO_TARGET" as const)
              : ("UNAVAILABLE" as const),
        };
  const rolling7Day = calculateRollingWeightAverage(
    points,
    input.currentDate,
    input.timezone,
  );
  const weekOverWeek = compareWeeklyWeightAverages(
    points,
    input.currentDate,
    input.timezone,
  );
  const trend = calculateWeightTrend(points, input.timezone);
  const graph = Object.fromEntries(
    (["7D", "30D", "90D", "ALL"] as const).map((range) => {
      const start = graphStart(range, input.currentDate);
      const rangePoints = input.records
        .filter(({ date }) =>
          start === null
            ? true
            : String(date) >= start && String(date) <= input.currentDate,
        )
        .map(({ date, weightKg }) => ({
          date: String(date),
          weightKg,
          rollingAverageKg: calculateRollingWeightAverage(
            points,
            String(date),
            input.timezone,
          ).averageKg,
        }));
      return [range, rangePoints];
    }),
  ) as Record<
    WeightGraphRange,
    { date: string; weightKg: number; rollingAverageKg: number | null }[]
  >;
  const baselineAssessment = input.baseline ? assessmentSummary(input.baseline) : null;
  const latestAssessment = input.latestAssessment
    ? assessmentSummary(input.latestAssessment)
    : null;

  return {
    timezone: input.timezone,
    currentDate: input.currentDate,
    baseline,
    latest,
    change,
    goal,
    rolling7Day,
    weekOverWeek,
    trend,
    graph,
    bodyComposition: {
      baseline: baselineAssessment,
      latest: latestAssessment,
      comparison:
        input.baseline &&
        input.latestAssessment &&
        input.baseline.id !== input.latestAssessment.id
          ? compareBodyComposition(input.baseline, input.latestAssessment)
          : null,
      history: [...input.assessments]
        .sort((left, right) => right.assessmentDate.localeCompare(left.assessmentDate))
        .map(assessmentSummary),
    },
  } as const;
}
