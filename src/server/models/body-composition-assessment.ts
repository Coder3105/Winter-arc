import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

interface SegmentDocument {
  massKg: number;
  percent: number;
  evaluation: string;
}

interface RegionSetDocument {
  leftArm: SegmentDocument;
  rightArm: SegmentDocument;
  trunk: SegmentDocument;
  leftLeg: SegmentDocument;
  rightLeg: SegmentDocument;
}

interface ImpedanceBandDocument {
  rightArm: number;
  leftArm: number;
  trunk: number;
  rightLeg: number;
  leftLeg: number;
}

export interface BodyCompositionAssessmentDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  winterArcConfigId: Types.ObjectId | null;
  source: string;
  assessmentDate: Date;
  isBaseline: boolean;
  notes: string | null;
  measurements: {
    heightCm: number;
    weightKg: number;
    totalBodyWaterL: number;
    proteinKg: number;
    mineralsKg: number;
    bodyFatMassKg: number;
    skeletalMuscleMassKg: number;
    percentBodyFat: number;
    bmiReported: number;
    fatFreeMassKg: number;
    basalMetabolicRateKcalReported: number;
    waistHipRatio: number;
    visceralFatLevel: number;
    obesityDegreePercent: number;
    fatMassIndexKgM2: number;
    targetWeightKgReported: number;
    weightControlKgReported: number;
    fatControlKgReported: number;
    muscleControlKgReported: number;
  };
  segmentalLean: RegionSetDocument;
  segmentalFat: RegionSetDocument;
  impedance: {
    khz20: ImpedanceBandDocument;
    khz100: ImpedanceBandDocument;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

const segmentSchema = new Schema<SegmentDocument>(
  {
    massKg: { type: Number, required: true, min: 0 },
    percent: { type: Number, required: true, min: 0 },
    evaluation: { type: String, required: true, trim: true, maxlength: 40 },
  },
  { _id: false },
);

const regionSetDefinition = {
  leftArm: { type: segmentSchema, required: true },
  rightArm: { type: segmentSchema, required: true },
  trunk: { type: segmentSchema, required: true },
  leftLeg: { type: segmentSchema, required: true },
  rightLeg: { type: segmentSchema, required: true },
};

const impedanceBandSchema = new Schema<ImpedanceBandDocument>(
  {
    rightArm: { type: Number, required: true, min: 0 },
    leftArm: { type: Number, required: true, min: 0 },
    trunk: { type: Number, required: true, min: 0 },
    rightLeg: { type: Number, required: true, min: 0 },
    leftLeg: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const bodyCompositionAssessmentSchema = new Schema<BodyCompositionAssessmentDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner", index: true },
    winterArcConfigId: {
      type: Schema.Types.ObjectId,
      ref: "WinterArcConfig",
      default: null,
    },
    source: { type: String, required: true, trim: true, maxlength: 100 },
    assessmentDate: { type: Date, required: true },
    isBaseline: { type: Boolean, required: true, default: false },
    notes: { type: String, default: null, maxlength: 2_000 },
    measurements: {
      heightCm: { type: Number, required: true, min: 0 },
      weightKg: { type: Number, required: true, min: 0 },
      totalBodyWaterL: { type: Number, required: true, min: 0 },
      proteinKg: { type: Number, required: true, min: 0 },
      mineralsKg: { type: Number, required: true, min: 0 },
      bodyFatMassKg: { type: Number, required: true, min: 0 },
      skeletalMuscleMassKg: { type: Number, required: true, min: 0 },
      percentBodyFat: { type: Number, required: true, min: 0 },
      bmiReported: { type: Number, required: true, min: 0 },
      fatFreeMassKg: { type: Number, required: true, min: 0 },
      basalMetabolicRateKcalReported: { type: Number, required: true, min: 0 },
      waistHipRatio: { type: Number, required: true, min: 0 },
      visceralFatLevel: { type: Number, required: true, min: 0 },
      obesityDegreePercent: { type: Number, required: true, min: 0 },
      fatMassIndexKgM2: { type: Number, required: true, min: 0 },
      targetWeightKgReported: { type: Number, required: true, min: 0 },
      weightControlKgReported: { type: Number, required: true },
      fatControlKgReported: { type: Number, required: true },
      muscleControlKgReported: { type: Number, required: true },
    },
    segmentalLean: regionSetDefinition,
    segmentalFat: regionSetDefinition,
    impedance: {
      type: new Schema(
        {
          khz20: { type: impedanceBandSchema, required: true },
          khz100: { type: impedanceBandSchema, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  {
    collection: "body_composition_assessments",
    timestamps: true,
  },
);

bodyCompositionAssessmentSchema.index({ userId: 1, assessmentDate: -1 });
bodyCompositionAssessmentSchema.index(
  { userId: 1, winterArcConfigId: 1, isBaseline: 1 },
  { unique: true, partialFilterExpression: { isBaseline: true } },
);

export const BodyCompositionAssessmentModel: Model<BodyCompositionAssessmentDocument> =
  (mongoose.models.BodyCompositionAssessment as
    Model<BodyCompositionAssessmentDocument> | undefined) ??
  mongoose.model<BodyCompositionAssessmentDocument>(
    "BodyCompositionAssessment",
    bodyCompositionAssessmentSchema,
  );
