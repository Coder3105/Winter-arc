import { describe, expect, it } from "vitest";

import { buildWeightAnalytics } from "@/server/calculations";

function assessment(id: string, date: string, weightKg: number, isBaseline = false) {
  return {
    id,
    source: "InBody120",
    assessmentDate: `${date}T06:00:00.000Z`,
    isBaseline,
    measurements: {
      weightKg,
      percentBodyFat: isBaseline ? 45.3 : 40.8,
      bodyFatMassKg: isBaseline ? 50.4 : 43,
      fatFreeMassKg: isBaseline ? 60.7 : 62,
      skeletalMuscleMassKg: isBaseline ? 34.3 : 35.1,
      visceralFatLevel: isBaseline ? 25 : 21,
      waistHipRatio: isBaseline ? 1.02 : 0.98,
    },
  };
}

function records(days: number, direction = -1) {
  return Array.from({ length: days }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, "0")}`,
    weightKg: 111 - index * 0.2 * direction * -1,
    recordedAt: `2026-09-${String(index + 1).padStart(2, "0")}T06:00:00Z`,
    source: "MANUAL" as const,
  }));
}

describe("weight analytics projection", () => {
  it("uses explicit baseline, latest record, formulas and all graph windows", () => {
    const baseline = assessment("base", "2026-08-14", 111.1, true);
    const latestAssessment = assessment("later", "2026-09-20", 107);
    const result = buildWeightAnalytics({
      timezone: "UTC",
      currentDate: "2026-09-30",
      targetWeightKg: 90,
      records: records(30),
      baseline,
      latestAssessment,
      assessments: [baseline, latestAssessment],
    });
    expect(result.baseline).toMatchObject({ date: "2026-08-14", weightKg: 111.1 });
    expect(result.latest).toMatchObject({ date: "2026-09-30", source: "WEIGHT_RECORD" });
    expect(result.change?.deltaKg).toBeLessThan(0);
    expect(result.goal.status).toBe("AVAILABLE");
    expect(result.rolling7Day).toMatchObject({ sampleCount: 7, isSufficientData: true });
    expect(result.weekOverWeek.isSufficientData).toBe(true);
    expect(result.trend?.slopeKgPerWeek).toBeLessThan(0);
    expect(result.graph["7D"]).toHaveLength(7);
    expect(result.graph["30D"]).toHaveLength(30);
    expect(result.graph["90D"]).toHaveLength(30);
    expect(result.graph.ALL).toHaveLength(30);
    expect(result.bodyComposition.comparison?.bodyFatPercentDeltaPoints).toBeCloseTo(
      -4.5,
    );
  });

  it("falls back to a clearly-labelled assessment without inventing baseline analytics", () => {
    const latest = assessment("later", "2026-09-20", 107);
    const result = buildWeightAnalytics({
      timezone: "UTC",
      currentDate: "2026-09-30",
      targetWeightKg: null,
      records: [],
      baseline: null,
      latestAssessment: latest,
      assessments: [latest],
    });
    expect(result.latest?.source).toBe("BODY_COMPOSITION_ASSESSMENT");
    expect(result.baseline).toBeNull();
    expect(result.change).toBeNull();
    expect(result.goal).toMatchObject({ status: "NO_TARGET", rawPercent: null });
    expect(result.graph.ALL).toEqual([]);
  });

  it("keeps baseline-only composition comparison unavailable", () => {
    const baseline = assessment("base", "2026-08-14", 111.1, true);
    const result = buildWeightAnalytics({
      timezone: "UTC",
      currentDate: "2026-09-30",
      targetWeightKg: null,
      records: [],
      baseline,
      latestAssessment: baseline,
      assessments: [baseline],
    });
    expect(result.bodyComposition.comparison).toBeNull();
    expect(result.bodyComposition.baseline?.measurements.weightKg).toBe(111.1);
  });

  it("preserves insufficient, flat and gain signals", () => {
    const baseline = assessment("base", "2026-08-14", 111.1, true);
    const sparse = buildWeightAnalytics({
      timezone: "UTC",
      currentDate: "2026-09-03",
      targetWeightKg: 120,
      records: records(3, 1),
      baseline,
      latestAssessment: baseline,
      assessments: [baseline],
    });
    expect(sparse.rolling7Day.isSufficientData).toBe(false);
    expect(sparse.weekOverWeek.isSufficientData).toBe(false);
    expect(sparse.change?.direction).toBe("UP");
  });
});
