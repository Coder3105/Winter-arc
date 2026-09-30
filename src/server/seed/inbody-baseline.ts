import "server-only";

import type { BodyCompositionInput } from "@/lib/validation/body-composition";

export const INBODY_BASELINE: BodyCompositionInput = {
  source: "InBody120",
  assessmentDate: "2026-08-14T19:11:00.000Z",
  isBaseline: true,
  notes:
    "Source report timestamp preserved as supplied; the assessment timezone was not recorded.",
  measurements: {
    heightCm: 178,
    weightKg: 111.1,
    totalBodyWaterL: 44.3,
    proteinKg: 12,
    mineralsKg: 4.34,
    bodyFatMassKg: 50.4,
    skeletalMuscleMassKg: 34.3,
    percentBodyFat: 45.3,
    bmiReported: 35.1,
    fatFreeMassKg: 60.7,
    basalMetabolicRateKcalReported: 1681,
    waistHipRatio: 1.02,
    visceralFatLevel: 25,
    obesityDegreePercent: 159,
    fatMassIndexKgM2: 15.9,
    targetWeightKgReported: 71.4,
    weightControlKgReported: -39.7,
    fatControlKgReported: -39.7,
    muscleControlKgReported: 0,
  },
  segmentalLean: {
    leftArm: { massKg: 3.65, percent: 100.5, evaluation: "Normal" },
    rightArm: { massKg: 3.76, percent: 103.6, evaluation: "Normal" },
    trunk: { massKg: 29.5, percent: 97.5, evaluation: "Normal" },
    leftLeg: { massKg: 9.47, percent: 85.5, evaluation: "Under" },
    rightLeg: { massKg: 9.5, percent: 85.7, evaluation: "Under" },
  },
  segmentalFat: {
    leftArm: { massKg: 5.3, percent: 845.4, evaluation: "Over" },
    rightArm: { massKg: 5.2, percent: 835, evaluation: "Over" },
    trunk: { massKg: 26, percent: 589, evaluation: "Over" },
    leftLeg: { massKg: 6.1, percent: 338.6, evaluation: "Over" },
    rightLeg: { massKg: 6.1, percent: 337.6, evaluation: "Over" },
  },
  impedance: {
    khz20: {
      rightArm: 330.9,
      leftArm: 346.4,
      trunk: 27.9,
      rightLeg: 289.2,
      leftLeg: 292.2,
    },
    khz100: {
      rightArm: 294.7,
      leftArm: 310.1,
      trunk: 24.4,
      rightLeg: 253.9,
      leftLeg: 254.8,
    },
  },
};
