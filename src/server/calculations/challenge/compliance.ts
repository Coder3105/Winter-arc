import { clampPercent, ratioPercent } from "../common/numeric";
import { CalculationError, integer, nonnegative, positive } from "../common/validation";

export type DailyRuleState = "PASS" | "FAIL" | "NOT_RECORDED" | "NOT_APPLICABLE";

export function calculateCompliance(completed: number, eligible: number) {
  integer(completed, "completed");
  integer(eligible, "eligible");
  const rawPercent = eligible === 0 ? null : ratioPercent(completed, eligible);
  return {
    completed,
    eligible,
    missed: Math.max(0, eligible - completed),
    rawPercent,
    clampedPercent: rawPercent === null ? null : clampPercent(rawPercent),
  };
}

/** Reporting policy must explicitly decide whether missing records are eligible. */
export function summarizeRuleCompliance(
  states: readonly DailyRuleState[],
  missingPolicy: "EXCLUDE" | "INCLUDE",
) {
  if (missingPolicy !== "EXCLUDE" && missingPolicy !== "INCLUDE")
    throw new CalculationError("missingPolicy", "must be explicit.");
  const counts = { PASS: 0, FAIL: 0, NOT_RECORDED: 0, NOT_APPLICABLE: 0 };
  for (const state of states) {
    if (!Object.hasOwn(counts, state))
      throw new CalculationError("state", "unknown daily rule state.");
    counts[state]++;
  }
  const eligible =
    counts.PASS + counts.FAIL + (missingPolicy === "INCLUDE" ? counts.NOT_RECORDED : 0);
  return { ...calculateCompliance(counts.PASS, eligible), counts, missingPolicy };
}

export function evaluateNumericMinimum(actual: number | null, target: number) {
  positive(target, "target");
  if (actual === null)
    return {
      actual,
      target,
      passed: null,
      state: "NOT_RECORDED" as const,
      rawPercent: null,
      completionPercent: null,
    };
  nonnegative(actual, "actual");
  const rawPercent = ratioPercent(actual, target);
  const passed = actual >= target;
  return {
    actual,
    target,
    passed,
    state: passed ? ("PASS" as const) : ("FAIL" as const),
    rawPercent,
    completionPercent: clampPercent(rawPercent),
  };
}

export function evaluateBooleanRule(actual: boolean | null, applicable = true) {
  if ((actual !== null && typeof actual !== "boolean") || typeof applicable !== "boolean")
    throw new CalculationError(
      "actual",
      "must be boolean or null; applicable must be boolean.",
    );
  const state: DailyRuleState = !applicable
    ? "NOT_APPLICABLE"
    : actual === null
      ? "NOT_RECORDED"
      : actual
        ? "PASS"
        : "FAIL";
  return {
    actual,
    state,
    passed: state === "PASS" ? true : state === "FAIL" ? false : null,
  };
}

export function evaluateMinimumSleepTarget(
  actualHours: number | null,
  targetHours: number,
) {
  return evaluateNumericMinimum(actualHours, targetHours);
}

export function evaluateHydration(consumedLitres: number | null, targetLitres: number) {
  return evaluateNumericMinimum(consumedLitres, targetLitres);
}

export function evaluateSteps(actualSteps: number | null, targetSteps: number) {
  integer(targetSteps, "targetSteps", 1);
  if (actualSteps !== null) integer(actualSteps, "actualSteps");
  return evaluateNumericMinimum(actualSteps, targetSteps);
}

export function weeklyCompletionPercent(completed: number, required: number) {
  return calculateCompliance(completed, required);
}
