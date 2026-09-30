import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_POLICY_VERSION,
  SYSTEM_TITLES,
} from "@/server/achievements/achievement-policy";

describe("achievement policy V1", () => {
  it("is centralized, versioned, unique, and contains the complete Phase 9 set", () => {
    expect(ACHIEVEMENT_POLICY_VERSION).toBe(1);
    expect(ACHIEVEMENT_DEFINITIONS).toHaveLength(21);
    expect(new Set(ACHIEVEMENT_DEFINITIONS.map((item) => item.key)).size).toBe(21);
    expect(ACHIEVEMENT_DEFINITIONS.map((item) => item.key)).toEqual([
      "FIRST_CLEAR",
      "PERFECT_STREAK_7",
      "PERFECT_STREAK_14",
      "PERFECT_STREAK_30",
      "HYDRATION_STREAK_7",
      "SLEEP_STREAK_7",
      "NO_JUNK_STREAK_7",
      "NO_FAP_STREAK_7",
      "STEPS_STREAK_7",
      "WORKOUT_WEEK_SECURED_1",
      "WORKOUT_WEEK_STREAK_4",
      "LEVEL_5",
      "LEVEL_10",
      "LEVEL_20",
      "RANK_A",
      "RANK_S",
      "RANK_S_PLUS",
      "DAY_30_ACTIVE",
      "DAY_60_ACTIVE",
      "DAY_90_COMPLETE",
      "PERFECT_WEEK",
    ]);
  });

  it("exposes only the explicit earned title set", () => {
    expect(SYSTEM_TITLES).toEqual([
      "SYSTEM INITIATE",
      "DISCIPLINED",
      "UNBROKEN",
      "ASCENDANT",
      "IRON CONSISTENCY",
      "RISING",
      "ELITE",
      "APEX",
      "TRANSCENDENT",
    ]);
  });
});
