import { describe, expect, it } from "vitest";

import { createDefaultDailyRules } from "@/features/winter-arc/rules";
import { winterArcInputSchema } from "@/lib/validation/winter-arc";

const validConfig = {
  name: "Winter Arc",
  durationDays: 90,
  startDate: "2026-10-01",
  status: "DRAFT" as const,
  startingWeightKg: 111.1,
  targetWeightKg: null,
  rules: createDefaultDailyRules(),
};

describe("Winter Arc configuration", () => {
  it("applies the four-workout default and preserves editable rules", () => {
    const config = winterArcInputSchema.parse(validConfig);
    expect(config.weeklyWorkoutTarget).toBe(4);
    expect(config.rules).toHaveLength(7);
    expect(config.rules.some((rule) => rule.key === "workout")).toBe(false);
    config.rules[1]!.target = 8;
    expect(config.rules[1]!.target).toBe(8);
  });

  it.each([0, 8])("rejects %s workouts per week", (weeklyWorkoutTarget) => {
    expect(() =>
      winterArcInputSchema.parse({ ...validConfig, weeklyWorkoutTarget }),
    ).toThrow();
  });

  it("rejects duplicate configurable rule keys", () => {
    const rules = createDefaultDailyRules();
    rules[1] = { ...rules[1]!, key: rules[0]!.key };
    expect(() => winterArcInputSchema.parse({ ...validConfig, rules })).toThrow();
  });
});
