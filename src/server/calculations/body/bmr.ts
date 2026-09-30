import { CalculationError, finite, integer, positive } from "../common/validation";

export type BmrSex = "male" | "female";
export interface BmrEstimate {
  readonly value: number;
  readonly unit: "kcal/day";
  readonly method: "MIFFLIN_ST_JEOR" | "KATCH_MCARDLE";
  readonly kind: "CALCULATED_ESTIMATE";
}

export function calculateMifflinStJeorBmr(input: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: BmrSex;
}): BmrEstimate {
  const { weightKg, heightCm, ageYears, sex } = input;
  positive(weightKg, "weightKg");
  positive(heightCm, "heightCm");
  integer(ageYears, "ageYears");
  if (ageYears > 150) throw new CalculationError("ageYears", "must be <= 150.");
  if (sex !== "male" && sex !== "female")
    throw new CalculationError(
      "sex",
      "requires an explicit male/female equation coefficient.",
    );
  const value = positive(
    finite(10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === "male" ? 5 : -161)),
    "bmr",
  );
  return {
    value,
    unit: "kcal/day",
    method: "MIFFLIN_ST_JEOR",
    kind: "CALCULATED_ESTIMATE",
  };
}

export function calculateKatchMcArdleBmr(fatFreeMassKg: number): BmrEstimate {
  const value = finite(370 + 21.6 * positive(fatFreeMassKg, "fatFreeMassKg"));
  return {
    value,
    unit: "kcal/day",
    method: "KATCH_MCARDLE",
    kind: "CALCULATED_ESTIMATE",
  };
}
