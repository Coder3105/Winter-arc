import { describe, expect, it } from "vitest";

import {
  buildRecoveryEpisodes,
  evaluateAchievementProgress,
  getFinalizedPerfectWeeks,
  longestConsecutiveCalendarRun,
  longestConsecutiveIntegerRun,
} from "@/server/calculations";

describe("achievement calculations", () => {
  it("deduplicates and measures calendar and challenge-week streaks", () => {
    expect(
      longestConsecutiveCalendarRun([
        "2026-12-31",
        "2027-01-01",
        "2027-01-01",
        "2027-01-03",
      ]),
    ).toBe(2);
    expect(longestConsecutiveIntegerRun([4, 2, 3, 3, 8])).toBe(3);
  });

  it("recognizes only finalized full seven-day perfect weeks", () => {
    const firstWeek = Array.from(
      { length: 7 },
      (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`,
    );
    expect(
      getFinalizedPerfectWeeks({
        challengeStartDate: "2026-10-01",
        durationDays: 10,
        currentDate: "2026-10-08",
        perfectDates: firstWeek,
      }),
    ).toEqual([1]);
    expect(
      getFinalizedPerfectWeeks({
        challengeStartDate: "2026-10-01",
        durationDays: 10,
        currentDate: "2026-10-07",
        perfectDates: firstWeek,
      }),
    ).toEqual([]);
  });

  it("clamps display progress while preserving qualification", () => {
    const metrics = {
      perfectDays: 2,
      perfectStreak: 8,
      hydrationStreak: 0,
      sleepStreak: 0,
      noJunkStreak: 0,
      noFapStreak: 0,
      stepsStreak: 0,
      securedWorkoutWeeks: 0,
      workoutWeekStreak: 0,
      level: 1,
      day30Active: 0,
      day60Active: 0,
      day90Complete: 0,
      perfectWeeks: 0,
    } as const;
    const progress = evaluateAchievementProgress(metrics);
    expect(progress.find((item) => item.key === "FIRST_CLEAR")).toMatchObject({
      qualified: true,
      progressPercent: 100,
    });
    expect(progress.find((item) => item.key === "PERFECT_STREAK_14")).toMatchObject({
      qualified: false,
      progressPercent: (8 / 14) * 100,
    });
  });

  it("consolidates failures until the next ordinary success and then starts fresh", () => {
    expect(
      buildRecoveryEpisodes(["day-1", "day-2", "day-3", "day-4", "day-5"], ["day-3"]),
    ).toEqual([
      { triggerKeys: ["day-1", "day-2"], clearingKey: "day-3" },
      { triggerKeys: ["day-4", "day-5"], clearingKey: null },
    ]);
  });
});
