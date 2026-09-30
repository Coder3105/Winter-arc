import { describe, expect, it } from "vitest";

import {
  aggregateCalendarMonth,
  calculatePerfectDayStreak,
  calculateRuleStreaks,
  calculateStreak,
  getCalendarMonthRange,
  summarizeCalendarDay,
} from "@/server/calculations";

describe("calendar history aggregation", () => {
  it.each(["2026-13", "2026-00", "26-10", "October", "2026-1"])(
    "rejects invalid month %s",
    (month) => expect(() => getCalendarMonthRange(month)).toThrow(),
  );

  it("uses a fixed Monday-first month layout across leap and year boundaries", () => {
    expect(getCalendarMonthRange("2026-10")).toEqual({
      month: "2026-10",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      dayCount: 31,
      leadingMondaySlots: 3,
    });
    expect(getCalendarMonthRange("2028-02").dayCount).toBe(29);
    expect(getCalendarMonthRange("2026-12").endDate).toBe("2026-12-31");
  });

  it.each([
    ["2026-09-29", "BEFORE_CHALLENGE", "OUTSIDE_CHALLENGE", null],
    ["2026-09-30", "CHALLENGE_DAY", "MISSED", 1],
    ["2026-12-28", "CHALLENGE_DAY", "FUTURE", 90],
    ["2026-12-29", "AFTER_CHALLENGE", "OUTSIDE_CHALLENGE", null],
  ] as const)("maps %s to challenge boundaries", (date, relation, state, day) => {
    expect(
      summarizeCalendarDay({
        date,
        currentDate: "2026-10-01",
        startDate: "2026-09-30",
        durationDays: 90,
      }),
    ).toMatchObject({ relation, calendarState: state, challengeDay: day });
  });

  it("distinguishes perfect, partial, missing, pending and future days", () => {
    const base = {
      currentDate: "2026-10-03",
      startDate: "2026-10-01",
      durationDays: 90,
    };
    const quest = (date: string, perfect: boolean) => ({
      date,
      status: perfect ? ("COMPLETE" as const) : ("MISSED" as const),
      isPerfectDay: perfect,
      completionPercent: perfect ? 100 : 50,
      completedRequiredRules: perfect ? 2 : 1,
      totalRequiredRules: 2,
    });
    expect(
      summarizeCalendarDay({
        ...base,
        date: "2026-10-01",
        quest: quest("2026-10-01", true),
      }).calendarState,
    ).toBe("PERFECT");
    expect(
      summarizeCalendarDay({
        ...base,
        date: "2026-10-02",
        quest: quest("2026-10-02", false),
      }).calendarState,
    ).toBe("PARTIAL");
    expect(summarizeCalendarDay({ ...base, date: "2026-10-02" })).toMatchObject({
      calendarState: "MISSED",
      recordExists: false,
      questStatus: "MISSED",
    });
    expect(summarizeCalendarDay({ ...base, date: "2026-10-03" }).calendarState).toBe(
      "TODAY_PENDING",
    );
    expect(summarizeCalendarDay({ ...base, date: "2026-10-04" }).calendarState).toBe(
      "FUTURE",
    );
  });

  it("normalizes today with the authoritative timezone", () => {
    const result = aggregateCalendarMonth({
      month: "2026-10",
      timezone: "Asia/Kolkata",
      startDate: "2026-10-01",
      durationDays: 90,
      currentInstant: "2026-09-30T20:00:00Z",
      quests: [],
    });
    expect(result.currentDate).toBe("2026-10-01");
    expect(result.days).toHaveLength(31);
    expect(result.days[0]?.calendarState).toBe("TODAY_PENDING");
  });

  it("overlays workout sessions without changing Daily Quest state", () => {
    const result = aggregateCalendarMonth({
      month: "2026-10",
      timezone: "UTC",
      startDate: "2026-10-01",
      durationDays: 90,
      currentInstant: "2026-10-03T12:00:00Z",
      quests: [],
      workoutDates: ["2026-10-01", "2026-10-01"],
    });
    expect(result.days[0]).toMatchObject({
      calendarState: "MISSED",
      isPerfectDay: false,
      recordExists: false,
      hasWorkout: true,
      workoutSessionCount: 2,
    });
  });

  it("overlays canonical weight without changing quest or workout state", () => {
    const result = aggregateCalendarMonth({
      month: "2026-10",
      timezone: "UTC",
      startDate: "2026-10-01",
      durationDays: 90,
      currentInstant: "2026-10-03T12:00:00Z",
      quests: [],
      weights: [{ date: "2026-10-01", weightKg: 108.6 }],
    });
    expect(result.days[0]).toMatchObject({
      calendarState: "MISSED",
      recordExists: false,
      hasWorkout: false,
      hasWeight: true,
      weightKg: 108.6,
    });
    expect(result.days[1]).toMatchObject({ hasWeight: false, weightKg: null });
  });

  it("rejects duplicate or invalid calendar weight overlays", () => {
    const base = {
      month: "2026-10",
      timezone: "UTC",
      startDate: "2026-10-01",
      durationDays: 90,
      currentInstant: "2026-10-03T12:00:00Z",
      quests: [],
    } as const;
    expect(() =>
      aggregateCalendarMonth({
        ...base,
        weights: [
          { date: "2026-10-01", weightKg: 108.6 },
          { date: "2026-10-01", weightKg: 108.5 },
        ],
      }),
    ).toThrow();
    expect(() =>
      aggregateCalendarMonth({
        ...base,
        weights: [{ date: "2026-10-01", weightKg: 0 }],
      }),
    ).toThrow();
  });
});

describe("streak calculations", () => {
  it("preserves yesterday's streak while today is pending and extends on pass", () => {
    const past = [true, true].map((passed) => ({
      temporalState: "PAST" as const,
      eligible: true,
      passed,
    }));
    expect(
      calculateStreak([
        ...past,
        { temporalState: "TODAY", eligible: true, passed: false },
      ]),
    ).toEqual({ current: 2, longest: 2 });
    expect(
      calculateStreak([
        ...past,
        { temporalState: "TODAY", eligible: true, passed: true },
      ]),
    ).toEqual({ current: 3, longest: 3 });
  });

  it("past misses break, future days do not, and completed endings are final", () => {
    expect(
      calculatePerfectDayStreak([
        { temporalState: "PAST", isPerfectDay: true },
        { temporalState: "PAST", isPerfectDay: false },
        { temporalState: "PAST", isPerfectDay: true },
        { temporalState: "PAST", isPerfectDay: true },
        { temporalState: "FUTURE", isPerfectDay: false },
      ]),
    ).toEqual({ current: 2, longest: 2 });
  });

  it("skips absent and not-applicable rule days without incrementing", () => {
    const quests = [
      { date: "2026-10-01", temporalState: "PAST" as const, rules: [] },
      {
        date: "2026-10-02",
        temporalState: "PAST" as const,
        rules: [{ key: "sleep", name: "Sleep", order: 1, state: "PASS" as const }],
      },
      {
        date: "2026-10-03",
        temporalState: "PAST" as const,
        rules: [
          { key: "sleep", name: "Sleep", order: 1, state: "NOT_APPLICABLE" as const },
        ],
      },
      {
        date: "2026-10-04",
        temporalState: "PAST" as const,
        rules: [{ key: "sleep", name: "Sleep", order: 1, state: "PASS" as const }],
      },
    ];
    expect(
      calculateRuleStreaks(quests, [{ key: "sleep", name: "Sleep", order: 1 }]),
    ).toEqual({ sleep: { name: "Sleep", current: 2, longest: 2 } });
  });

  it("keeps today's explicit rule failure provisional", () => {
    expect(
      calculateStreak([
        { temporalState: "PAST", eligible: true, passed: true },
        { temporalState: "TODAY", eligible: true, passed: false },
      ]).current,
    ).toBe(1);
  });
});
