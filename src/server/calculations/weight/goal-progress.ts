import { clampPercent } from "../common/numeric";
import { finite, positive } from "../common/validation";

export interface GoalProgress {
  readonly rawPercent: number | null;
  readonly clampedPercent: number | null;
  readonly status: "AVAILABLE" | "NO_TARGET" | "MAINTENANCE";
}

export function calculateGoalProgress({
  startingWeightKg,
  currentWeightKg,
  targetWeightKg,
}: {
  startingWeightKg: number;
  currentWeightKg: number;
  targetWeightKg?: number | null;
}): GoalProgress {
  positive(startingWeightKg, "startingWeightKg");
  positive(currentWeightKg, "currentWeightKg");
  if (targetWeightKg == null)
    return { rawPercent: null, clampedPercent: null, status: "NO_TARGET" };
  positive(targetWeightKg, "targetWeightKg");
  if (startingWeightKg === targetWeightKg)
    return { rawPercent: null, clampedPercent: null, status: "MAINTENANCE" };
  const rawPercent = finite(
    ((currentWeightKg - startingWeightKg) / (targetWeightKg - startingWeightKg)) * 100,
  );
  return { rawPercent, clampedPercent: clampPercent(rawPercent), status: "AVAILABLE" };
}
