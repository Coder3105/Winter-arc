import {
  CalculationError,
  finite,
  nonnegative,
  percentage,
  positive,
} from "../common/validation";

export function calculateBodyFatMass(weightKg: number, bodyFatPercent: number): number {
  return finite(
    positive(weightKg, "weightKg") * (percentage(bodyFatPercent, "bodyFatPercent") / 100),
  );
}

export function calculateFatFreeMass(weightKg: number, bodyFatMassKg: number): number {
  positive(weightKg, "weightKg");
  nonnegative(bodyFatMassKg, "bodyFatMassKg");
  if (bodyFatMassKg > weightKg)
    throw new CalculationError("bodyFatMassKg", "cannot exceed weightKg.");
  return finite(weightKg - bodyFatMassKg);
}

export function calculateBodyFatPercent(weightKg: number, bodyFatMassKg: number): number {
  calculateFatFreeMass(weightKg, bodyFatMassKg);
  return finite((bodyFatMassKg / weightKg) * 100);
}

/** Field names match assessment.measurements; missing source data remains missing. */
export interface BodyCompositionSnapshot {
  readonly measurements: {
    readonly weightKg?: number | null;
    readonly percentBodyFat?: number | null;
    readonly bodyFatMassKg?: number | null;
    readonly fatFreeMassKg?: number | null;
    readonly skeletalMuscleMassKg?: number | null;
    readonly visceralFatLevel?: number | null;
    readonly waistHipRatio?: number | null;
  };
}

function validateSnapshot({ measurements: m }: BodyCompositionSnapshot): void {
  for (const key of [
    "weightKg",
    "percentBodyFat",
    "bodyFatMassKg",
    "fatFreeMassKg",
    "skeletalMuscleMassKg",
    "visceralFatLevel",
    "waistHipRatio",
  ] as const) {
    const value = m[key];
    if (value == null) continue;
    if (key === "weightKg") positive(value, key);
    else if (key === "percentBodyFat") percentage(value, key);
    else nonnegative(value, key);
    if (
      m.weightKg != null &&
      ["bodyFatMassKg", "fatFreeMassKg", "skeletalMuscleMassKg"].includes(key) &&
      value > m.weightKg
    ) {
      throw new CalculationError(key, "cannot exceed weightKg.");
    }
  }
}

export function compareBodyComposition(
  start: BodyCompositionSnapshot,
  current: BodyCompositionSnapshot,
) {
  validateSnapshot(start);
  validateSnapshot(current);
  const delta = (key: keyof BodyCompositionSnapshot["measurements"]) => {
    const a = start.measurements[key];
    const b = current.measurements[key];
    return a == null || b == null ? null : finite(b - a);
  };
  return {
    weightDeltaKg: delta("weightKg"),
    bodyFatPercentDeltaPoints: delta("percentBodyFat"),
    bodyFatMassDeltaKg: delta("bodyFatMassKg"),
    fatFreeMassDeltaKg: delta("fatFreeMassKg"),
    skeletalMuscleMassDeltaKg: delta("skeletalMuscleMassKg"),
    visceralFatLevelDelta: delta("visceralFatLevel"),
    waistHipRatioDelta: delta("waistHipRatio"),
  };
}
