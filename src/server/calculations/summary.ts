import { calculateBmi } from "./body/bmi";
import { calculateKatchMcArdleBmr, calculateMifflinStJeorBmr } from "./body/bmr";
import {
  calculateBodyFatMass,
  calculateFatFreeMass,
  compareBodyComposition,
  type BodyCompositionSnapshot,
} from "./body/body-composition";
import { calculateChallengeDay, challengeDayToWeek } from "./challenge/challenge-date";
import { type CalendarInput } from "./common/calendar";
import { calculateGoalProgress } from "./weight/goal-progress";

export interface SummaryAssessment extends BodyCompositionSnapshot {
  readonly id: string;
  readonly source: string;
  readonly assessmentDate: string;
  readonly measurements: {
    readonly heightCm: number;
    readonly weightKg: number;
    readonly percentBodyFat: number;
    readonly bodyFatMassKg: number;
    readonly fatFreeMassKg: number;
    readonly skeletalMuscleMassKg: number;
    readonly bmiReported: number;
    readonly basalMetabolicRateKcalReported: number;
    readonly waistHipRatio: number;
    readonly visceralFatLevel: number;
  };
}

export interface SummaryInput {
  readonly profile: {
    readonly ageAtBaseline: number | null;
    readonly sex: string | null;
    readonly timezone: string;
  } | null;
  readonly config: {
    readonly startDate: string;
    readonly durationDays: number;
    readonly startingWeightKg: number | null;
    readonly targetWeightKg: number | null;
    readonly status: string;
  } | null;
  readonly baseline: SummaryAssessment | null;
  readonly latest: SummaryAssessment | null;
  readonly currentDate: CalendarInput;
}

function sourceValues(assessment: SummaryAssessment | null) {
  if (!assessment) return null;
  const m = assessment.measurements;
  return {
    assessmentId: assessment.id,
    assessmentDate: assessment.assessmentDate,
    provider: assessment.source,
    heightCm: m.heightCm,
    weightKg: m.weightKg,
    bodyFatPercent: m.percentBodyFat,
    bodyFatMassKg: m.bodyFatMassKg,
    fatFreeMassKg: m.fatFreeMassKg,
    skeletalMuscleMassKg: m.skeletalMuscleMassKg,
    bmiReported: m.bmiReported,
    bmrReported: m.basalMetabolicRateKcalReported,
    waistHipRatio: m.waistHipRatio,
    visceralFatLevel: m.visceralFatLevel,
  };
}

/** Read-only projection. No measurement is modified or substituted with an estimate. */
export function buildCalculationSummary({
  profile,
  config,
  baseline,
  latest,
  currentDate,
}: SummaryInput) {
  const source = sourceValues(latest);
  const sex = profile?.sex;
  const mifflinInputs: Parameters<typeof calculateMifflinStJeorBmr>[0] | null =
    profile &&
    profile.ageAtBaseline !== null &&
    (sex === "male" || sex === "female") &&
    source
      ? {
          weightKg: source.weightKg,
          heightCm: source.heightCm,
          ageYears: profile.ageAtBaseline,
          sex,
        }
      : null;
  const challenge =
    config && profile
      ? calculateChallengeDay({
          startDate: config.startDate,
          currentDate,
          timezone: profile.timezone,
          durationDays: config.durationDays,
        })
      : null;
  return {
    source,
    baselineSource: sourceValues(baseline),
    calculated: source
      ? {
          bmi: calculateBmi(source.weightKg, source.heightCm),
          bodyFatMassDerivedKg: calculateBodyFatMass(
            source.weightKg,
            source.bodyFatPercent,
          ),
          fatFreeMassDerivedKg: calculateFatFreeMass(
            source.weightKg,
            source.bodyFatMassKg,
          ),
          bmr: {
            mifflinStJeor: mifflinInputs
              ? calculateMifflinStJeorBmr(mifflinInputs)
              : null,
            katchMcArdle:
              source.fatFreeMassKg > 0
                ? calculateKatchMcArdleBmr(source.fatFreeMassKg)
                : null,
          },
        }
      : null,
    inputs: {
      mifflin: mifflinInputs
        ? { ...mifflinInputs, ageBasis: "PROFILE_AGE_AT_BASELINE" as const }
        : null,
      katchFatFreeMassBasis: source ? ("REPORTED_FAT_FREE_MASS" as const) : null,
      fatFreeMassBasis: source ? ("WEIGHT_MINUS_REPORTED_FAT_MASS" as const) : null,
    },
    unavailable: {
      mifflinStJeor: !source
        ? "ASSESSMENT_REQUIRED"
        : !profile
          ? "PROFILE_REQUIRED"
          : !mifflinInputs
            ? "SUPPORTED_SEX_COEFFICIENT_REQUIRED"
            : null,
      katchMcArdle: !source
        ? "ASSESSMENT_REQUIRED"
        : source.fatFreeMassKg <= 0
          ? "POSITIVE_FAT_FREE_MASS_REQUIRED"
          : null,
    },
    bodyCompositionChange:
      baseline && latest ? compareBodyComposition(baseline, latest) : null,
    goalProgress:
      config && config.startingWeightKg !== null && source
        ? calculateGoalProgress({
            startingWeightKg: config.startingWeightKg,
            currentWeightKg: source.weightKg,
            targetWeightKg: config.targetWeightKg,
          })
        : null,
    challenge: challenge
      ? {
          ...challenge,
          configurationStatus: config!.status,
          week:
            challenge.status === "ACTIVE"
              ? challengeDayToWeek(challenge.dayNumber, config!.durationDays)
              : null,
        }
      : null,
  };
}

export type CalculationSummary = ReturnType<typeof buildCalculationSummary>;
