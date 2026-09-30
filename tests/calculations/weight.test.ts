import { describe, expect, it } from "vitest";
import {
  CalculationError,
  calculateWeightChange,
  calculateWeightChangePercent,
  describeWeightChange,
  calculateGoalProgress,
  calculateRollingWeightAverage,
  compareWeeklyWeightAverages,
  calculateWeightTrend,
  type WeightDataPoint,
} from "@/server/calculations";

const series = (
  days: readonly number[],
  weight: (day: number) => number,
): WeightDataPoint[] =>
  days.map((day) => ({
    date: `2026-09-${String(day).padStart(2, "0")}`,
    weightKg: weight(day),
  }));

describe("weight change and goals", () => {
  it.each([
    [111.1, 105, -6.1, "DOWN"],
    [90, 95, 5, "UP"],
    [90, 90, 0, "UNCHANGED"],
  ] as const)(
    "describes %s to %s with signed delta",
    (start, current, delta, direction) => {
      expect(calculateWeightChange(start, current)).toBeCloseTo(delta);
      expect(calculateWeightChangePercent(start, current)).toBeCloseTo(
        (delta / start) * 100,
      );
      expect(describeWeightChange(start, current)).toMatchObject({
        deltaKg: expect.closeTo(delta),
        magnitudeKg: expect.closeTo(Math.abs(delta)),
        direction,
      });
    },
  );
  it.each([
    [100, 80, 90, 50, 50],
    [80, 100, 90, 50, 50],
    [100, 80, 110, -50, 0],
    [100, 80, 80, 100, 100],
    [100, 80, 70, 150, 100],
    [80, 100, 110, 150, 100],
    [80, 100, 70, -50, 0],
  ])(
    "goal %s → %s at %s",
    (startingWeightKg, targetWeightKg, currentWeightKg, rawPercent, clampedPercent) => {
      expect(
        calculateGoalProgress({ startingWeightKg, targetWeightKg, currentWeightKg }),
      ).toEqual({ rawPercent, clampedPercent, status: "AVAILABLE" });
    },
  );
  it("matches the supplied loss goal", () => {
    expect(
      calculateGoalProgress({
        startingWeightKg: 111.1,
        targetWeightKg: 90,
        currentWeightKg: 105,
      }).rawPercent,
    ).toBeCloseTo(28.90995, 4);
  });
  it.each([undefined, null])("handles absent target %s", (targetWeightKg) => {
    const input = { startingWeightKg: 100, currentWeightKg: 95 };
    expect(
      calculateGoalProgress(
        targetWeightKg === undefined ? input : { ...input, targetWeightKg },
      ),
    ).toEqual({ rawPercent: null, clampedPercent: null, status: "NO_TARGET" });
  });
  it.each([95, 100, 105])(
    "maintenance has no percent denominator at %s",
    (currentWeightKg) => {
      expect(
        calculateGoalProgress({
          startingWeightKg: 100,
          targetWeightKg: 100,
          currentWeightKg,
        }).status,
      ).toBe("MAINTENANCE");
    },
  );
  it.each([0, -1, Infinity, NaN])("rejects invalid weights %s", (value) => {
    expect(() => calculateWeightChange(value, 90)).toThrow(CalculationError);
    expect(() => calculateWeightChange(90, value)).toThrow(CalculationError);
    expect(() =>
      calculateGoalProgress({
        startingWeightKg: 100,
        currentWeightKg: 95,
        targetWeightKg: value,
      }),
    ).toThrow(CalculationError);
  });
});

describe("calendar rolling averages", () => {
  it("uses exactly the current date and preceding six dates", () => {
    const points = series([1, 2, 3, 4, 5, 6, 7, 8, 9], (day) =>
      day === 1 || day === 9 ? 500 : day + 100,
    );
    expect(calculateRollingWeightAverage(points, "2026-09-08", "UTC")).toEqual({
      averageKg: 105,
      sampleCount: 7,
      windowStart: "2026-09-02",
      windowEnd: "2026-09-08",
      isSufficientData: true,
    });
  });
  it("ignores missing dates without replacing them or extending the window", () => {
    const points = series([1, 3, 5, 7], () => 100);
    expect(calculateRollingWeightAverage(points, "2026-09-07", "UTC")).toMatchObject({
      averageKg: 100,
      sampleCount: 4,
      isSufficientData: true,
    });
  });
  it.each([0, 1, 2, 3])("marks %s measurements insufficient", (count) => {
    const result = calculateRollingWeightAverage(
      series([1, 2, 3].slice(0, count), () => 100),
      "2026-09-07",
      "UTC",
    );
    expect(result).toMatchObject({
      sampleCount: count,
      isSufficientData: false,
      averageKg: count ? 100 : null,
    });
  });
  it("sorts without mutating input", () => {
    const points = series([7, 1, 5, 3], (day) => 100 + day);
    const before = structuredClone(points);
    expect(calculateRollingWeightAverage(points, "2026-09-07", "UTC")).toEqual(
      calculateRollingWeightAverage([...points].reverse(), "2026-09-07", "UTC"),
    );
    expect(points).toEqual(before);
  });
  it("normalizes instants in the supplied timezone", () => {
    const result = calculateRollingWeightAverage(
      [{ date: new Date("2026-09-07T23:00:00Z"), weightKg: 100 }],
      "2026-09-07",
      "Asia/Kolkata",
    );
    expect(result.sampleCount).toBe(0);
  });
  it("rejects duplicate local dates including equivalent timestamp inputs", () => {
    expect(() =>
      calculateRollingWeightAverage(
        [
          { date: "2026-09-02", weightKg: 100 },
          { date: "2026-09-01T20:00:00Z", weightKg: 99 },
        ],
        "2026-09-02",
        "Asia/Kolkata",
      ),
    ).toThrow(CalculationError);
  });
  it.each(["invalid", "2026-02-30", "2026-09-01T00:00:00"])("rejects date %s", (date) => {
    expect(() =>
      calculateRollingWeightAverage([{ date, weightKg: 100 }], "2026-09-07", "UTC"),
    ).toThrow(CalculationError);
  });
  it("rejects invalid weights even outside the window", () => {
    expect(() =>
      calculateRollingWeightAverage(
        [{ date: "2025-01-01", weightKg: NaN }],
        "2026-09-07",
        "UTC",
      ),
    ).toThrow(CalculationError);
  });
});

describe("week-over-week averages", () => {
  it.each([-2, 2, 0])("compares windows with %s kg change", (change) => {
    const points = series([1, 3, 5, 7, 8, 10, 12, 14], (day) =>
      day <= 7 ? 100 : 100 + change,
    );
    const result = compareWeeklyWeightAverages(points, "2026-09-14", "UTC");
    expect(result).toMatchObject({
      currentAverageKg: 100 + change,
      previousAverageKg: 100,
      deltaKg: change,
      deltaPercent: change,
      currentSampleCount: 4,
      previousSampleCount: 4,
      isSufficientData: true,
    });
  });
  it.each([
    [1, 8, 10, 12, 14],
    [1, 3, 5, 7, 8],
  ])("flags either sparse window (%j)", (...days) => {
    expect(
      compareWeeklyWeightAverages(
        series(days, () => 100),
        "2026-09-14",
        "UTC",
      ).isSufficientData,
    ).toBe(false);
  });
  it("does not fabricate comparisons without either average", () => {
    expect(
      compareWeeklyWeightAverages(
        series([14], () => 100),
        "2026-09-14",
        "UTC",
      ),
    ).toMatchObject({ previousAverageKg: null, deltaKg: null, deltaPercent: null });
  });
});

describe("retrospective OLS", () => {
  it("keeps a flat decimal series exactly flat despite floating-point mean rounding", () => {
    const result = calculateWeightTrend(
      series([1, 3, 5, 8, 12, 15, 20], () => 111.1),
      "UTC",
    )!;
    expect(result.slopeKgPerDay).toBe(0);
    expect(result.intercept).toBe(111.1);
    expect(result.rSquared).toBeNull();
  });
  it.each([-0.2, 0.2, 0])("fits slope %s with irregular dates", (slope) => {
    const points = series([10, 1, 3, 7], (day) => 100 + (day - 1) * slope);
    const result = calculateWeightTrend(points, "UTC")!;
    expect(result.slopeKgPerDay).toBeCloseTo(slope, 10);
    expect(result.slopeKgPerWeek).toBeCloseTo(slope * 7, 10);
    expect(result.intercept).toBeCloseTo(100, 10);
    expect(result).toMatchObject({
      sampleCount: 4,
      startDate: "2026-09-01",
      endDate: "2026-09-10",
    });
    expect(result.rSquared).toBe(slope === 0 ? null : 1);
  });
  it("returns a non-perfect fit for noisy data", () => {
    const result = calculateWeightTrend(
      [
        { date: "2026-09-01", weightKg: 100 },
        { date: "2026-09-02", weightKg: 99 },
        { date: "2026-09-03", weightKg: 100 },
      ],
      "UTC",
    )!;
    expect(result.rSquared).toBeCloseTo(0);
    expect(result.slopeKgPerDay).toBeCloseTo(0);
  });
  it.each([0, 1, 2])("requires 3 samples (got %s)", (count) => {
    expect(
      calculateWeightTrend(
        series([1, 2].slice(0, count), () => 100),
        "UTC",
      ),
    ).toBeNull();
  });
  it("rejects duplicate and invalid dates before considering sufficiency", () => {
    expect(() =>
      calculateWeightTrend(
        series([1, 1, 2], () => 100),
        "UTC",
      ),
    ).toThrow(CalculationError);
    expect(() => calculateWeightTrend([{ date: "bad", weightKg: 100 }], "UTC")).toThrow(
      CalculationError,
    );
  });
});
