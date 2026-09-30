import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CalculatedMetrics } from "@/components/profile/calculated-metrics";
import { buildCalculationSummary, type SummaryInput } from "@/server/calculations";
import { INBODY_BASELINE } from "@/server/seed/inbody-baseline";

const baseline = { ...INBODY_BASELINE, id: "baseline" };
const input: SummaryInput = {
  profile: { ageAtBaseline: 24, sex: "male", timezone: "Asia/Kolkata" },
  config: {
    startDate: "2026-09-30",
    durationDays: 90,
    startingWeightKg: 111.1,
    targetWeightKg: 90,
    status: "ACTIVE",
  },
  baseline,
  latest: baseline,
  currentDate: "2026-09-30",
};

describe("calculation summary projection", () => {
  it("keeps source and calculated baseline metrics separate and unrounded", () => {
    const frozen = structuredClone(input);
    Object.freeze(frozen.baseline!.measurements);
    const before = structuredClone(frozen);
    const summary = buildCalculationSummary(frozen);
    expect(summary.source).toMatchObject({
      bodyFatMassKg: 50.4,
      bodyFatPercent: 45.3,
      fatFreeMassKg: 60.7,
      bmiReported: 35.1,
      bmrReported: 1681,
    });
    expect(summary.calculated).toMatchObject({
      bmi: expect.closeTo(35.0650170433, 8),
      bodyFatMassDerivedKg: expect.closeTo(50.3283, 8),
      fatFreeMassDerivedKg: expect.closeTo(60.7, 8),
    });
    expect(summary.calculated?.bmr.mifflinStJeor?.value).toBe(2108.5);
    expect(summary.calculated?.bmr.katchMcArdle?.value).toBeCloseTo(1681.12, 8);
    expect(summary.inputs.katchFatFreeMassBasis).toBe("REPORTED_FAT_FREE_MASS");
    expect(summary.inputs.mifflin?.ageBasis).toBe("PROFILE_AGE_AT_BASELINE");
    expect(summary.challenge).toMatchObject({ dayNumber: 1, week: { weekNumber: 1 } });
    expect(frozen).toEqual(before);
  });
  it("uses the latest scan while retaining the baseline source and deltas", () => {
    const latest = {
      ...baseline,
      id: "later",
      assessmentDate: "2026-09-30T00:00:00Z",
      measurements: {
        ...baseline.measurements,
        weightKg: 105,
        percentBodyFat: 40,
        bodyFatMassKg: 42,
        fatFreeMassKg: 63,
      },
    };
    const summary = buildCalculationSummary({ ...input, latest });
    expect(summary.source?.assessmentId).toBe("later");
    expect(summary.baselineSource?.assessmentId).toBe("baseline");
    expect(summary.bodyCompositionChange?.bodyFatPercentDeltaPoints).toBeCloseTo(-5.3);
    expect(summary.goalProgress?.rawPercent).toBeCloseTo(28.90995, 4);
    expect(summary.calculated?.bmr.katchMcArdle?.value).toBeCloseTo(1730.8);
  });
  it("returns explicit missing results with incomplete setup", () => {
    const summary = buildCalculationSummary({ ...input, profile: null, config: null });
    expect(summary.calculated?.bmr.mifflinStJeor).toBeNull();
    expect(summary.unavailable.mifflinStJeor).toBe("PROFILE_REQUIRED");
    expect(summary.calculated?.bmr.katchMcArdle?.value).toBeCloseTo(1681.12);
    expect(summary.challenge).toBeNull();
    expect(summary.goalProgress).toBeNull();
  });
  it.each(["other", "prefer_not_to_say"])(
    "does not invent a coefficient for %s",
    (sex) => {
      const summary = buildCalculationSummary({
        ...input,
        profile: { ...input.profile!, sex },
      });
      expect(summary.calculated?.bmr.mifflinStJeor).toBeNull();
      expect(summary.unavailable.mifflinStJeor).toBe(
        "SUPPORTED_SEX_COEFFICIENT_REQUIRED",
      );
    },
  );
  it("handles missing assessments", () => {
    const summary = buildCalculationSummary({ ...input, baseline: null, latest: null });
    expect(summary.source).toBeNull();
    expect(summary.calculated).toBeNull();
    expect(summary.bodyCompositionChange).toBeNull();
    expect(summary.unavailable.mifflinStJeor).toBe("ASSESSMENT_REQUIRED");
  });
  it("does not treat reported FFM as a difference to recompute for Katch", () => {
    const latest = {
      ...baseline,
      measurements: { ...baseline.measurements, fatFreeMassKg: 61 },
    };
    const summary = buildCalculationSummary({ ...input, latest });
    expect(summary.calculated?.fatFreeMassDerivedKg).toBeCloseTo(60.7);
    expect(summary.calculated?.bmr.katchMcArdle?.value).toBeCloseTo(1687.6);
  });
});

describe("profile read-only calculated metrics", () => {
  it("labels estimates and device values and rounds only for display", () => {
    const markup = renderToStaticMarkup(
      createElement(CalculatedMetrics, { summary: buildCalculationSummary(input) }),
    );
    expect(markup).toContain("BMI // CALCULATED");
    expect(markup).toContain("BMR // REPORTED BY INBODY120");
    expect(markup).toContain("KATCH-MCARDLE // ESTIMATE");
    expect(markup).toContain("MIFFLIN-ST JEOR // ESTIMATE");
    expect(markup).toContain("2,109 kcal/day");
    expect(markup).toContain("1,681 kcal/day");
    expect(markup).toContain("50.3 kg");
    expect(markup).toContain("50.4");
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("NaN");
  });
  it("explains unavailable values for incomplete profile and missing scans", () => {
    const missingProfile = renderToStaticMarkup(
      createElement(CalculatedMetrics, {
        summary: buildCalculationSummary({ ...input, profile: null }),
      }),
    );
    expect(missingProfile).toContain("requires a completed profile");
    const noAssessment = renderToStaticMarkup(
      createElement(CalculatedMetrics, {
        summary: buildCalculationSummary({ ...input, latest: null, baseline: null }),
      }),
    );
    expect(noAssessment).toContain("An assessment is needed");
  });
});
