import { describe, expect, it } from "vitest";
import {
  CalculationError,
  calculateBmi,
  calculateBodyFatMass,
  calculateBodyFatPercent,
  calculateFatFreeMass,
  calculateKatchMcArdleBmr,
  calculateMifflinStJeorBmr,
  calculateWaistHipRatio,
  compareBodyComposition,
  roundForDisplay,
} from "@/server/calculations";
import { INBODY_BASELINE } from "@/server/seed/inbody-baseline";

describe("baseline formula regression and source preservation", () => {
  it("calculates estimates at full precision without replacing measured values", () => {
    const before = structuredClone(INBODY_BASELINE);
    const m = INBODY_BASELINE.measurements;
    const bmi = calculateBmi(m.weightKg, m.heightCm);
    expect(bmi).toBeCloseTo(35.0650170433, 8);
    expect(roundForDisplay(bmi, 1)).toBe(35.1);
    expect(calculateBodyFatMass(m.weightKg, m.percentBodyFat)).toBeCloseTo(50.3283, 8);
    expect(calculateFatFreeMass(m.weightKg, m.bodyFatMassKg)).toBeCloseTo(60.7, 8);
    expect(calculateBodyFatPercent(m.weightKg, m.bodyFatMassKg)).toBeCloseTo(
      45.36453645,
      7,
    );
    expect(calculateKatchMcArdleBmr(m.fatFreeMassKg)).toMatchObject({
      value: expect.closeTo(1681.12, 8),
      unit: "kcal/day",
      method: "KATCH_MCARDLE",
    });
    expect(
      calculateMifflinStJeorBmr({
        weightKg: m.weightKg,
        heightCm: m.heightCm,
        ageYears: 24,
        sex: "male",
      }),
    ).toMatchObject({ value: 2108.5, method: "MIFFLIN_ST_JEOR" });
    expect(INBODY_BASELINE).toEqual(before);
    expect(m.bodyFatMassKg).toBe(50.4);
    expect(m.basalMetabolicRateKcalReported).toBe(1681);
  });
});

describe("body calculations", () => {
  it.each([0, -1, NaN, Infinity, -Infinity])(
    "rejects invalid weight or height %s",
    (value) => {
      expect(() => calculateBmi(value, 178)).toThrow(CalculationError);
      expect(() => calculateBmi(111.1, value)).toThrow(CalculationError);
      expect(() => calculateBodyFatMass(value, 20)).toThrow(CalculationError);
    },
  );
  it.each([
    [0, 0],
    [20, 16],
    [100, 80],
  ])("fat percent %s gives mass %s", (percent, mass) => {
    expect(calculateBodyFatMass(80, percent)).toBe(mass);
    expect(calculateBodyFatPercent(80, mass)).toBe(percent);
  });
  it.each([-1, 101, NaN, Infinity])("rejects invalid percent %s", (percent) => {
    expect(() => calculateBodyFatMass(80, percent)).toThrow(CalculationError);
  });
  it.each([-1, 81, NaN, Infinity])("rejects invalid fat mass %s", (mass) => {
    expect(() => calculateFatFreeMass(80, mass)).toThrow(CalculationError);
    expect(() => calculateBodyFatPercent(80, mass)).toThrow(CalculationError);
  });
  it("allows zero FFM as a difference, but not as a BMR input", () => {
    expect(calculateFatFreeMass(80, 80)).toBe(0);
    expect(() => calculateKatchMcArdleBmr(0)).toThrow(CalculationError);
  });
  it.each([-1, NaN, Infinity])("rejects invalid FFM %s", (value) => {
    expect(() => calculateKatchMcArdleBmr(value)).toThrow(CalculationError);
  });
  it.each(["male", "female"] as const)("uses the explicit %s coefficient", (sex) => {
    expect(
      calculateMifflinStJeorBmr({ weightKg: 80, heightCm: 180, ageYears: 30, sex }).value,
    ).toBe(sex === "male" ? 1780 : 1614);
  });
  it.each([-1, 151, 24.5, NaN, Infinity])("rejects invalid age %s", (ageYears) => {
    expect(() =>
      calculateMifflinStJeorBmr({ weightKg: 80, heightCm: 180, ageYears, sex: "male" }),
    ).toThrow(CalculationError);
  });
  it("rejects unsupported runtime coefficient and nonsensical BMR", () => {
    expect(() =>
      calculateMifflinStJeorBmr({
        weightKg: 80,
        heightCm: 180,
        ageYears: 30,
        sex: "other" as "male",
      }),
    ).toThrow(CalculationError);
    expect(() =>
      calculateMifflinStJeorBmr({
        weightKg: 1,
        heightCm: 1,
        ageYears: 100,
        sex: "female",
      }),
    ).toThrow(CalculationError);
  });
  it("calculates WHR using matching units", () => {
    expect(calculateWaistHipRatio({ waistCm: 102, hipCm: 100 })).toBeCloseTo(1.02);
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid waist/hip %s", (value) => {
    expect(() => calculateWaistHipRatio({ waistCm: value, hipCm: 100 })).toThrow(
      CalculationError,
    );
    expect(() => calculateWaistHipRatio({ waistCm: 100, hipCm: value })).toThrow(
      CalculationError,
    );
  });
  it("rejects numeric output overflow", () => {
    expect(() => calculateBmi(Number.MAX_VALUE, Number.MIN_VALUE)).toThrow(
      CalculationError,
    );
    expect(() => calculateKatchMcArdleBmr(Number.MAX_VALUE)).toThrow(CalculationError);
  });
});

describe("body composition comparison", () => {
  it("uses percentage points and compares only available source metrics", () => {
    const current = {
      measurements: {
        weightKg: 105,
        percentBodyFat: 40,
        bodyFatMassKg: 42,
        fatFreeMassKg: 63,
        skeletalMuscleMassKg: 35,
        visceralFatLevel: 22,
        waistHipRatio: 0.98,
      },
    };
    const delta = compareBodyComposition(INBODY_BASELINE, current);
    expect(delta.weightDeltaKg).toBeCloseTo(-6.1);
    expect(delta.bodyFatPercentDeltaPoints).toBeCloseTo(-5.3);
    expect(delta.bodyFatMassDeltaKg).toBeCloseTo(-8.4);
    expect(delta.fatFreeMassDeltaKg).toBeCloseTo(2.3);
    expect(delta.skeletalMuscleMassDeltaKg).toBeCloseTo(0.7);
    expect(delta.visceralFatLevelDelta).toBe(-3);
    expect(delta.waistHipRatioDelta).toBeCloseTo(-0.04);
  });
  it("returns null for missing comparisons and preserves zero", () => {
    const delta = compareBodyComposition(
      { measurements: { bodyFatMassKg: 0 } },
      { measurements: { bodyFatMassKg: 0, percentBodyFat: 30 } },
    );
    expect(delta.bodyFatMassDeltaKg).toBe(0);
    expect(delta.bodyFatPercentDeltaPoints).toBeNull();
    expect(delta.weightDeltaKg).toBeNull();
  });
  it("rejects invalid metrics even when the matching metric is missing", () => {
    expect(() =>
      compareBodyComposition(
        { measurements: { percentBodyFat: 101 } },
        { measurements: {} },
      ),
    ).toThrow(CalculationError);
    expect(() =>
      compareBodyComposition(
        { measurements: { weightKg: 80, bodyFatMassKg: 90 } },
        { measurements: {} },
      ),
    ).toThrow(CalculationError);
  });
});
