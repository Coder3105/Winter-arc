import { CalculationError, finite, integer } from "./validation";

export const DISPLAY_PRECISION = {
  weightKg: 1,
  bmi: 1,
  bodyFatPercent: 1,
  bmrKcal: 0,
  waterLitres: 2,
  percent: 1,
  trend: 2,
} as const;

/** Presentation only; formulas never call this function. Uses JS rounding semantics. */
export function roundForDisplay(value: number, decimals: number): number {
  finite(value);
  integer(decimals, "decimals");
  if (decimals > 6) throw new CalculationError("decimals", "must be <= 6.");
  const factor = 10 ** decimals;
  const result = finite(Math.round(finite(value * factor)) / factor);
  return Object.is(result, -0) ? 0 : result;
}
