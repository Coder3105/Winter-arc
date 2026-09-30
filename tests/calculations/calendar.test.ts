import { describe, expect, it } from "vitest";
import {
  CalculationError,
  addCalendarDays,
  normalizeCalendarDate,
  calculateChallengeDay,
  challengeDayToWeek,
  calculateSleepDuration,
  roundForDisplay,
} from "@/server/calculations";

describe("calendar and challenge days", () => {
  it("rejects instants that normalize outside supported calendar years", () => {
    expect(() => normalizeCalendarDate(new Date("0000-01-01T00:00:00Z"), "UTC")).toThrow(
      CalculationError,
    );
    expect(() =>
      normalizeCalendarDate(new Date("+010000-01-01T00:00:00Z"), "UTC"),
    ).toThrow(CalculationError);
  });
  it.each([
    [-1, 0, 0, 90, "NOT_STARTED"],
    [0, 1, 0, 90, "ACTIVE"],
    [6, 7, 6, 84, "ACTIVE"],
    [7, 8, 7, 83, "ACTIVE"],
    [89, 90, 89, 1, "ACTIVE"],
    [90, 90, 90, 0, "COMPLETED"],
    [100, 90, 90, 0, "COMPLETED"],
  ] as const)(
    "offset %s has correct boundaries",
    (offset, dayNumber, daysElapsed, daysRemaining, status) => {
      const result = calculateChallengeDay({
        startDate: "2026-09-30",
        currentDate: addCalendarDays("2026-09-30", offset),
        timezone: "Asia/Kolkata",
      });
      expect(result).toMatchObject({ dayNumber, daysElapsed, daysRemaining, status });
      expect(result.progressPercent).toBeCloseTo((daysElapsed / 90) * 100);
    },
  );
  it("uses calendar days across the spring DST boundary", () => {
    expect(
      calculateChallengeDay({
        startDate: "2026-03-07T12:00:00-05:00",
        currentDate: "2026-03-09T00:01:00-04:00",
        timezone: "America/New_York",
      }).dayNumber,
    ).toBe(3);
  });
  it("uses calendar days across the autumn DST boundary", () => {
    expect(
      calculateChallengeDay({
        startDate: "2026-10-31",
        currentDate: "2026-11-02T00:01:00-05:00",
        timezone: "America/New_York",
      }).dayNumber,
    ).toBe(3);
  });
  it("resolves timezone midnight boundaries explicitly", () => {
    const currentDate = "2026-09-30T20:00:00Z";
    expect(
      calculateChallengeDay({
        startDate: "2026-09-30",
        currentDate,
        timezone: "Asia/Kolkata",
      }).dayNumber,
    ).toBe(2);
    expect(
      calculateChallengeDay({
        startDate: "2026-09-30",
        currentDate,
        timezone: "America/New_York",
      }).dayNumber,
    ).toBe(1);
  });
  it.each(["", "Not/A_Timezone"])("rejects invalid timezone %s", (timezone) => {
    expect(() => normalizeCalendarDate("2026-09-30", timezone)).toThrow(CalculationError);
  });
  it.each([
    "2026-02-29",
    "2026-04-31",
    "2026-01-01T24:00:00Z",
    "2026-02-30T12:00:00Z",
    "2026-01-01T01:00:00",
    "0000-01-01",
  ])("rejects invalid calendar input %s", (date) => {
    expect(() => normalizeCalendarDate(date, "UTC")).toThrow(CalculationError);
  });
  it("handles leap/year boundaries and literal date-only labels", () => {
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(normalizeCalendarDate("2026-09-30", "America/Los_Angeles")).toBe("2026-09-30");
    expect(addCalendarDays("0099-12-31", 1)).toBe("0100-01-01");
  });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid duration %s", (durationDays) => {
    expect(() =>
      calculateChallengeDay({
        startDate: "2026-09-30",
        currentDate: "2026-09-30",
        timezone: "UTC",
        durationDays,
      }),
    ).toThrow(CalculationError);
  });
  it("supports configured duration", () => {
    expect(
      calculateChallengeDay({
        startDate: "2026-09-30",
        currentDate: "2026-10-01",
        timezone: "UTC",
        durationDays: 1,
      }).status,
    ).toBe("COMPLETED");
  });
});

describe("challenge-relative weeks", () => {
  it.each([
    [1, 1, 1, 1, 7],
    [7, 1, 7, 1, 7],
    [8, 2, 1, 8, 14],
    [84, 12, 7, 78, 84],
    [85, 13, 1, 85, 90],
    [90, 13, 6, 85, 90],
  ])(
    "maps day %s",
    (
      dayOfChallenge,
      weekNumber,
      dayInChallengeWeek,
      weekStartChallengeDay,
      weekEndChallengeDay,
    ) => {
      expect(challengeDayToWeek(dayOfChallenge)).toEqual({
        weekNumber,
        dayOfChallenge,
        dayInChallengeWeek,
        weekStartChallengeDay,
        weekEndChallengeDay,
      });
    },
  );
  it.each([0, -1, 91, 1.5, Infinity])("rejects out of challenge day %s", (day) => {
    expect(() => challengeDayToWeek(day)).toThrow(CalculationError);
  });
});

describe("sleep duration", () => {
  it.each([
    ["2026-09-30T01:00:00+05:30", "2026-09-30T08:00:00+05:30", "Asia/Kolkata", 7],
    ["2026-09-30T23:00:00+05:30", "2026-10-01T07:30:00+05:30", "Asia/Kolkata", 8.5],
    ["2026-03-07T23:00:00-05:00", "2026-03-08T07:00:00-04:00", "America/New_York", 7],
    ["2026-10-31T23:00:00-04:00", "2026-11-01T07:00:00-05:00", "America/New_York", 9],
  ] as const)(
    "measures real elapsed sleep from %s",
    (sleepStart, wakeTime, timezone, hours) => {
      expect(calculateSleepDuration({ sleepStart, wakeTime, timezone })).toMatchObject({
        durationHours: hours,
        durationMinutes: hours * 60,
      });
    },
  );
  it("does not guess the next day for reversed timestamps", () => {
    expect(() =>
      calculateSleepDuration({
        sleepStart: "2026-09-30T23:00:00Z",
        wakeTime: "2026-09-30T07:00:00Z",
        timezone: "UTC",
      }),
    ).toThrow(CalculationError);
  });
  it.each(["23:00", "2026-09-30", "2026-09-30T23:00:00", new Date(NaN)])(
    "rejects ambiguous/invalid input %s",
    (sleepStart) => {
      expect(() =>
        calculateSleepDuration({
          sleepStart,
          wakeTime: "2026-10-01T07:00:00Z",
          timezone: "UTC",
        }),
      ).toThrow(CalculationError);
    },
  );
});

describe("presentation-only rounding", () => {
  it.each([
    [35.06375457, 1, 35.1],
    [2108.5, 0, 2109],
    [1681.12, 0, 1681],
    [50.3283, 2, 50.33],
    [-0.0001, 1, 0],
  ])("rounds %s at %s decimals", (value, decimals, expected) => {
    expect(roundForDisplay(value, decimals)).toBe(expected);
  });
  it.each([-1, 7, 1.5, NaN])("rejects precision %s", (decimals) => {
    expect(() => roundForDisplay(1, decimals)).toThrow(CalculationError);
  });
});
