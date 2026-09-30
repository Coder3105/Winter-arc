import { describe, expect, it } from "vitest";
import {
  CalculationError,
  calculateCompliance,
  evaluateBooleanRule,
  evaluateNumericMinimum,
  evaluateMinimumSleepTarget,
  evaluateHydration,
  evaluateSteps,
  summarizeRuleCompliance,
  weeklyCompletionPercent,
} from "@/server/calculations";

describe("compliance", () => {
  it.each([
    [4, 4, 0, 100, 100],
    [3, 4, 1, 75, 75],
    [0, 4, 4, 0, 0],
    [5, 4, 0, 125, 100],
    [0, 0, 0, null, null],
    [2, 0, 0, null, null],
  ])("counts %s/%s", (completed, eligible, missed, rawPercent, clampedPercent) => {
    expect(calculateCompliance(completed, eligible)).toEqual({
      completed,
      eligible,
      missed,
      rawPercent,
      clampedPercent,
    });
  });
  it.each([-1, 0.5, NaN, Infinity])("rejects invalid counts %s", (value) => {
    expect(() => calculateCompliance(value, 4)).toThrow(CalculationError);
    expect(() => calculateCompliance(3, value)).toThrow(CalculationError);
  });
  it("keeps missing and failing states separate under either explicit report policy", () => {
    const states = ["PASS", "FAIL", "NOT_RECORDED", "NOT_APPLICABLE"] as const;
    const exclude = summarizeRuleCompliance(states, "EXCLUDE");
    const include = summarizeRuleCompliance(states, "INCLUDE");
    expect(exclude.rawPercent).toBe(50);
    expect(include.rawPercent).toBeCloseTo(100 / 3);
    expect(include.counts).toEqual({
      PASS: 1,
      FAIL: 1,
      NOT_RECORDED: 1,
      NOT_APPLICABLE: 1,
    });
    expect(include.counts).toEqual(exclude.counts);
  });
  it.each([
    [null, true, "NOT_RECORDED", null],
    [false, true, "FAIL", false],
    [true, true, "PASS", true],
    [true, false, "NOT_APPLICABLE", null],
  ] as const)("boolean %s applicable %s", (actual, applicable, state, passed) => {
    expect(evaluateBooleanRule(actual, applicable)).toEqual({ actual, state, passed });
  });
});

describe("configured numeric rule targets", () => {
  it.each([
    [5, 10, false, 50, 50],
    [10, 10, true, 100, 100],
    [15, 10, true, 150, 100],
    [0, 10, false, 0, 0],
  ])(
    "evaluates %s against %s",
    (actual, target, passed, rawPercent, completionPercent) => {
      expect(evaluateNumericMinimum(actual, target)).toEqual({
        actual,
        target,
        passed,
        state: passed ? "PASS" : "FAIL",
        rawPercent,
        completionPercent,
      });
    },
  );
  it("preserves a missing numeric measurement", () => {
    expect(evaluateNumericMinimum(null, 7)).toMatchObject({
      state: "NOT_RECORDED",
      passed: null,
      rawPercent: null,
    });
  });
  it.each([-1, NaN, Infinity])("rejects invalid actual %s", (actual) => {
    expect(() => evaluateNumericMinimum(actual, 7)).toThrow(CalculationError);
  });
  it.each([0, -1, NaN, Infinity])(
    "rejects invalid target %s even if missing actual",
    (target) => {
      expect(() => evaluateNumericMinimum(null, target)).toThrow(CalculationError);
    },
  );
  it.each([
    [6, 7, false],
    [7, 7, true],
    [8, 7, true],
    [7, 8, false],
  ])("sleep %s vs %s is %s", (actual, target, passed) => {
    expect(evaluateMinimumSleepTarget(actual, target).passed).toBe(passed);
  });
  it.each([
    [2, 3, false],
    [3, 3, true],
    [4, 3, true],
    [2.5, 2.5, true],
  ])("hydration %s vs %s is %s", (actual, target, passed) => {
    expect(evaluateHydration(actual, target).passed).toBe(passed);
    expect(evaluateHydration(actual, target).rawPercent).toBeCloseTo(
      (actual / target) * 100,
    );
  });
  it.each([
    [9999, 10000, false],
    [10000, 10000, true],
    [12000, 10000, true],
    [6000, 6000, true],
  ])("steps %s vs %s is %s", (actual, target, passed) => {
    expect(evaluateSteps(actual, target).passed).toBe(passed);
  });
  it.each([-1, 1.5, Infinity])("rejects invalid step counts %s", (actual) => {
    expect(() => evaluateSteps(actual, 10000)).toThrow(CalculationError);
  });
  it.each([
    [0, 0, 0],
    [3, 75, 75],
    [4, 100, 100],
    [5, 125, 100],
  ])("workout primitive %s/4", (completed, rawPercent, clampedPercent) => {
    expect(weeklyCompletionPercent(completed, 4)).toMatchObject({
      rawPercent,
      clampedPercent,
    });
  });
});
