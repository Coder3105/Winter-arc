import { describe, expect, it } from "vitest";

import { bodyCompositionInputSchema } from "@/lib/validation/body-composition";
import { INBODY_BASELINE } from "@/server/seed/inbody-baseline";

describe("InBody source assessment", () => {
  it("validates and preserves the supplied baseline values", () => {
    const baseline = bodyCompositionInputSchema.parse(INBODY_BASELINE);
    expect(baseline.isBaseline).toBe(true);
    expect(baseline.measurements.weightKg).toBe(111.1);
    expect(baseline.measurements.percentBodyFat).toBe(45.3);
    expect(baseline.measurements.skeletalMuscleMassKg).toBe(34.3);
    expect(baseline.measurements.bmiReported).toBe(35.1);
    expect(baseline.measurements.basalMetabolicRateKcalReported).toBe(1681);
    expect(baseline.impedance?.khz100.leftLeg).toBe(254.8);
  });

  it("keeps the reported target separate from protocol configuration", () => {
    expect(INBODY_BASELINE.measurements.targetWeightKgReported).toBe(71.4);
    expect(INBODY_BASELINE).not.toHaveProperty("targetWeightKg");
  });

  it("supports future assessments by accepting non-baseline records", () => {
    const laterAssessment = {
      ...INBODY_BASELINE,
      assessmentDate: "2026-11-14T19:11:00.000Z",
      isBaseline: false,
    };
    expect(bodyCompositionInputSchema.parse(laterAssessment).isBaseline).toBe(false);
    expect(INBODY_BASELINE.assessmentDate).toBe("2026-08-14T19:11:00.000Z");
  });
});
