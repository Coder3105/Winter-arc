import { ratioPercent } from "../common/numeric";
import { finite, positive } from "../common/validation";

export function calculateWeightChange(
  startingWeightKg: number,
  currentWeightKg: number,
): number {
  return finite(
    positive(currentWeightKg, "currentWeightKg") -
      positive(startingWeightKg, "startingWeightKg"),
  );
}

export function calculateWeightChangePercent(
  startingWeightKg: number,
  currentWeightKg: number,
): number {
  return ratioPercent(
    calculateWeightChange(startingWeightKg, currentWeightKg),
    startingWeightKg,
  );
}

export function describeWeightChange(startingWeightKg: number, currentWeightKg: number) {
  const deltaKg = calculateWeightChange(startingWeightKg, currentWeightKg);
  const direction: "DOWN" | "UP" | "UNCHANGED" =
    deltaKg < 0 ? "DOWN" : deltaKg > 0 ? "UP" : "UNCHANGED";
  return { deltaKg, direction, magnitudeKg: Math.abs(deltaKg) };
}
