import { describe, expect, it } from "vitest";

import {
  calculateWorkoutWeekStreak,
  evaluateWorkoutWeek,
  getChallengeWeekBounds,
} from "@/server/calculations";

const base = {
  challengeStartDate: "2026-09-30",
  durationDays: 90,
  challengeWeek: 1,
  requiredWorkoutDays: 4,
};

function dates(count: number) {
  return ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"].slice(0, count);
}

describe("workout week boundaries", () => {
  it("uses challenge-relative Wednesday through Tuesday weeks", () => {
    expect(
      getChallengeWeekBounds({
        challengeStartDate: "2026-09-30",
        durationDays: 90,
        challengeWeek: 1,
      }),
    ).toMatchObject({
      weekStartDate: "2026-09-30",
      weekEndDate: "2026-10-06",
      startChallengeDay: 1,
      endChallengeDay: 7,
    });
    expect(
      getChallengeWeekBounds({
        challengeStartDate: "2026-09-30",
        durationDays: 90,
        challengeWeek: 2,
      }),
    ).toMatchObject({
      weekStartDate: "2026-10-07",
      weekEndDate: "2026-10-13",
      startChallengeDay: 8,
      endChallengeDay: 14,
    });
  });

  it("uses a six-day final Week 13", () => {
    expect(
      getChallengeWeekBounds({
        challengeStartDate: "2026-09-30",
        durationDays: 90,
        challengeWeek: 13,
      }),
    ).toMatchObject({
      weekStartDate: "2026-12-23",
      weekEndDate: "2026-12-28",
      weekLengthDays: 6,
      startChallengeDay: 85,
      endChallengeDay: 90,
    });
  });
});

describe("distinct workout days", () => {
  it.each([
    [["2026-09-30"], 1, 1],
    [["2026-09-30", "2026-09-30"], 1, 2],
    [["2026-09-30", "2026-09-30", "2026-10-01"], 2, 3],
    [["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"], 4, 4],
  ])("deduplicates %j", (workoutDates, days, sessions) => {
    expect(
      evaluateWorkoutWeek({
        ...base,
        currentDate: "2026-10-02",
        workoutDates,
      }),
    ).toMatchObject({ completedWorkoutDays: days, totalWorkoutSessions: sessions });
  });
});

describe("weekly mission state machine", () => {
  it.each([
    [0, "2026-09-30", "NOT_STARTED", 4, 7],
    [1, "2026-10-01", "ON_TRACK", 3, 6],
    [2, "2026-10-02", "ON_TRACK", 2, 5],
    [2, "2026-10-03", "ON_TRACK", 2, 4],
    [2, "2026-10-04", "AT_RISK", 2, 3],
    [2, "2026-10-05", "CRITICAL", 2, 2],
    [3, "2026-10-06", "CRITICAL", 1, 1],
    [2, "2026-10-06", "FAILED", 2, 1],
    [4, "2026-10-03", "SECURED", 0, 4],
  ] as const)(
    "%s completed on %s is %s",
    (completed, currentDate, state, remaining, daysRemaining) => {
      expect(
        evaluateWorkoutWeek({
          ...base,
          currentDate,
          workoutDates: dates(completed),
        }),
      ).toMatchObject({
        state,
        workoutsRemaining: remaining,
        daysRemaining,
      });
    },
  );

  it("keeps extra sessions and extra workout days secured", () => {
    expect(
      evaluateWorkoutWeek({
        ...base,
        currentDate: "2026-10-04",
        workoutDates: [...dates(4), "2026-10-04", "2026-10-04"],
      }),
    ).toMatchObject({
      state: "SECURED",
      completedWorkoutDays: 5,
      totalWorkoutSessions: 6,
      rawCompletionPercent: 125,
      completionPercent: 100,
    });
  });

  it.each([
    [1, 4, "ON_TRACK"],
    [2, 4, "ON_TRACK"],
    [2, 3, "AT_RISK"],
    [2, 2, "CRITICAL"],
    [2, 1, "FAILED"],
    [0, 1, "SECURED"],
  ] as const)("maps %s remaining / %s days to %s", (remaining, remainingDays, state) => {
    const completed = 4 - remaining;
    const dayOffset = 7 - remainingDays;
    expect(
      evaluateWorkoutWeek({
        ...base,
        currentDate: [
          "2026-09-30",
          "2026-10-01",
          "2026-10-02",
          "2026-10-03",
          "2026-10-04",
          "2026-10-05",
          "2026-10-06",
        ][dayOffset]!,
        workoutDates: dates(completed),
      }).state,
    ).toBe(state);
  });

  it.each([
    ["2026-09-30", 7],
    ["2026-10-01", 6],
    ["2026-10-06", 1],
    ["2026-10-07", 0],
  ])("has %s inclusive days remaining at %s", (currentDate, daysRemaining) => {
    expect(
      evaluateWorkoutWeek({ ...base, currentDate, workoutDates: [] }).daysRemaining,
    ).toBe(daysRemaining);
  });

  it.each([
    ["2026-12-23", 6],
    ["2026-12-28", 1],
    ["2026-12-29", 0],
  ])("handles final-week remaining days on %s", (currentDate, daysRemaining) => {
    expect(
      evaluateWorkoutWeek({
        ...base,
        challengeWeek: 13,
        currentDate,
        workoutDates: [],
      }).daysRemaining,
    ).toBe(daysRemaining);
  });

  it.each([
    [3, "FAILED"],
    [4, "SECURED"],
  ] as const)("finalizes %s/4 as %s", (completed, state) => {
    expect(
      evaluateWorkoutWeek({
        ...base,
        currentDate: "2026-10-07",
        workoutDates: dates(completed),
      }),
    ).toMatchObject({ state, isWeekFinalized: true, daysRemaining: 0 });
  });
});

describe("weekly workout streak", () => {
  const secured = { isWeekFinalized: true, state: "SECURED" as const };
  const failed = { isWeekFinalized: true, state: "FAILED" as const };

  it("finds current and longest finalized sequences", () => {
    expect(
      calculateWorkoutWeekStreak([secured, secured, failed, secured, secured, secured]),
    ).toEqual({ current: 3, longest: 3 });
  });

  it("does not break on an active unsecured week", () => {
    expect(
      calculateWorkoutWeekStreak([
        secured,
        secured,
        { isWeekFinalized: false, state: "AT_RISK" },
      ]),
    ).toEqual({ current: 2, longest: 2 });
  });

  it("extends immediately for an active secured week", () => {
    expect(
      calculateWorkoutWeekStreak([secured, { isWeekFinalized: false, state: "SECURED" }]),
    ).toEqual({ current: 2, longest: 2 });
  });

  it("is zero before any finalized or secured week", () => {
    expect(
      calculateWorkoutWeekStreak([{ isWeekFinalized: false, state: "NOT_STARTED" }]),
    ).toEqual({ current: 0, longest: 0 });
  });
});
