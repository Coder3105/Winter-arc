import { z } from "zod";

const positiveMeasurement = z.number().positive();
const nonnegativeMeasurement = z.number().nonnegative();

const segmentSchema = z.object({
  massKg: nonnegativeMeasurement,
  percent: nonnegativeMeasurement,
  evaluation: z.string().trim().min(1).max(40),
});

const regionsSchema = z.object({
  leftArm: segmentSchema,
  rightArm: segmentSchema,
  trunk: segmentSchema,
  leftLeg: segmentSchema,
  rightLeg: segmentSchema,
});

const impedanceBandSchema = z.object({
  rightArm: positiveMeasurement,
  leftArm: positiveMeasurement,
  trunk: positiveMeasurement,
  rightLeg: positiveMeasurement,
  leftLeg: positiveMeasurement,
});

export const bodyCompositionInputSchema = z.object({
  source: z.string().trim().min(1).max(100),
  assessmentDate: z.iso.datetime({ offset: true }),
  isBaseline: z.boolean().default(false),
  notes: z.string().trim().max(2_000).nullable().default(null),
  measurements: z.object({
    heightCm: positiveMeasurement,
    weightKg: positiveMeasurement,
    totalBodyWaterL: nonnegativeMeasurement,
    proteinKg: nonnegativeMeasurement,
    mineralsKg: nonnegativeMeasurement,
    bodyFatMassKg: nonnegativeMeasurement,
    skeletalMuscleMassKg: nonnegativeMeasurement,
    percentBodyFat: nonnegativeMeasurement,
    bmiReported: nonnegativeMeasurement,
    fatFreeMassKg: nonnegativeMeasurement,
    basalMetabolicRateKcalReported: nonnegativeMeasurement,
    waistHipRatio: nonnegativeMeasurement,
    visceralFatLevel: nonnegativeMeasurement,
    obesityDegreePercent: nonnegativeMeasurement,
    fatMassIndexKgM2: nonnegativeMeasurement,
    targetWeightKgReported: positiveMeasurement,
    weightControlKgReported: z.number(),
    fatControlKgReported: z.number(),
    muscleControlKgReported: z.number(),
  }),
  segmentalLean: regionsSchema,
  segmentalFat: regionsSchema,
  impedance: z
    .object({
      khz20: impedanceBandSchema,
      khz100: impedanceBandSchema,
    })
    .nullable()
    .default(null),
});

export type BodyCompositionInput = z.infer<typeof bodyCompositionInputSchema>;
