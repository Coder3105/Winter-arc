import { describe, expect, it } from "vitest";

import {
  DAILY_RULE_CATALOGUE,
  getDailyRuleDefinition,
} from "@/features/winter-arc/rules";
import {
  onboardingActivationInputSchema,
  onboardingDraftInputSchema,
} from "@/lib/validation/onboarding";

const valid = {
  displayName: "New Hunter",
  heightCm: null,
  currentWeightKg: null,
  targetWeightKg: null,
  ageAtBaseline: null,
  sex: null,
  timezone: "Asia/Kolkata",
  startDate: "2026-10-05",
  weeklyWorkoutTarget: 4,
  rules: [{ key: "journaling" as const, target: null }],
};

describe("V2.3 onboarding validation and catalogue", () => {
  it("keeps all personal metrics optional and stores no fake zero", () => {
    expect(onboardingActivationInputSchema.safeParse(valid).success).toBe(true);
    for (const field of ["heightCm", "currentWeightKg", "targetWeightKg"] as const) {
      expect(
        onboardingActivationInputSchema.safeParse({ ...valid, [field]: 0 }).success,
      ).toBe(false);
    }
  });

  it("requires explicit timezone, start date, workout target, and one rule", () => {
    expect(
      onboardingActivationInputSchema.safeParse({ ...valid, timezone: null }).success,
    ).toBe(false);
    expect(
      onboardingActivationInputSchema.safeParse({ ...valid, startDate: null }).success,
    ).toBe(false);
    expect(
      onboardingActivationInputSchema.safeParse({
        ...valid,
        weeklyWorkoutTarget: null,
      }).success,
    ).toBe(false);
    expect(
      onboardingActivationInputSchema.safeParse({ ...valid, rules: [] }).success,
    ).toBe(false);
  });

  it.each([1, 4, 7])("accepts an explicitly selected %s/7 workout target", (target) => {
    expect(
      onboardingActivationInputSchema.safeParse({
        ...valid,
        weeklyWorkoutTarget: target,
      }).success,
    ).toBe(true);
  });

  it("allows incomplete values in an explicitly saved inactive draft", () => {
    expect(
      onboardingDraftInputSchema.safeParse({
        ...valid,
        displayName: "",
        timezone: null,
        startDate: null,
        weeklyWorkoutTarget: null,
        rules: [],
      }).success,
    ).toBe(true);
  });

  it("marks No Fap private and not recommended", () => {
    expect(getDailyRuleDefinition("no_fap")).toMatchObject({
      private: true,
      recommended: false,
      description: "Optional private binary habit.",
    });
  });

  it("centralizes 11 stable rules and validates every numeric target", () => {
    expect(DAILY_RULE_CATALOGUE.map((rule) => rule.key)).toEqual([
      "morning_weight",
      "sleep",
      "hydration",
      "steps",
      "nutrition",
      "no_junk_food",
      "no_fap",
      "reading",
      "meditation",
      "journaling",
      "stretching",
    ]);
    for (const rule of DAILY_RULE_CATALOGUE.filter((item) => item.target)) {
      expect(
        onboardingActivationInputSchema.safeParse({
          ...valid,
          rules: [{ key: rule.key, target: null }],
        }).success,
      ).toBe(false);
      expect(
        onboardingActivationInputSchema.safeParse({
          ...valid,
          rules: [{ key: rule.key, target: rule.target!.placeholder }],
        }).success,
      ).toBe(true);
    }
  });

  it("rejects duplicate rules and fractional whole-unit targets", () => {
    expect(
      onboardingActivationInputSchema.safeParse({
        ...valid,
        rules: [
          { key: "journaling", target: null },
          { key: "journaling", target: null },
        ],
      }).success,
    ).toBe(false);
    expect(
      onboardingActivationInputSchema.safeParse({
        ...valid,
        rules: [{ key: "reading", target: 1.5 }],
      }).success,
    ).toBe(false);
  });
});
