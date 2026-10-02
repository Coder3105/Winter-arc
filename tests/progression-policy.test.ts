import { describe, expect, it } from "vitest";

import {
  calculateDailyQuestPotentialXp,
  getDailyRuleXp,
  PERFECT_DAY_XP,
  PROGRESSION_RULE_VERSION,
  WEEKLY_WORKOUT_XP,
  WORKOUT_DAY_XP,
} from "@/lib/progression/xp-policy";

describe("XP policy V2", () => {
  it("preserves legacy awards and adds the four V2.3 rules", () => {
    expect(PROGRESSION_RULE_VERSION).toBe(2);
    expect(
      [
        "morning_weight",
        "sleep",
        "hydration",
        "no_junk_food",
        "no_fap",
        "steps",
        "nutrition",
      ].map((key) => getDailyRuleXp(key)),
    ).toEqual([5, 15, 10, 20, 20, 10, 15]);
    expect(
      ["reading", "meditation", "journaling", "stretching"].map((key) =>
        getDailyRuleXp(key),
      ),
    ).toEqual([10, 10, 10, 10]);
    expect(PERFECT_DAY_XP).toBe(25);
    expect(WORKOUT_DAY_XP).toBe(30);
    expect(WEEKLY_WORKOUT_XP).toBe(100);
  });

  it("gives the default snapshot 120 possible XP and reduces disabled rules", () => {
    const keys = [
      "morning_weight",
      "sleep",
      "hydration",
      "no_junk_food",
      "no_fap",
      "steps",
      "nutrition",
    ];
    expect(calculateDailyQuestPotentialXp(keys)).toBe(120);
    expect(calculateDailyQuestPotentialXp(keys.filter((key) => key !== "no_fap"))).toBe(
      100,
    );
  });

  it("awards unknown future rules zero XP without failing", () => {
    expect(getDailyRuleXp("future_rule")).toBe(0);
    expect(calculateDailyQuestPotentialXp(["future_rule"])).toBe(25);
  });
});
