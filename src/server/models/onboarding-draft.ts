import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

import { DAILY_RULE_CATALOGUE } from "@/features/winter-arc/rules";

export interface OnboardingDraftDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  displayName: string;
  heightCm: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  ageAtBaseline: number | null;
  sex: "male" | "female" | "other" | "prefer_not_to_say" | null;
  timezone: string | null;
  startDate: string | null;
  weeklyWorkoutTarget: number | null;
  rules: Array<{ key: string; target: number | null }>;
  createdAt: Date;
  updatedAt: Date;
}

const onboardingDraftSchema = new Schema<OnboardingDraftDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner" },
    displayName: { type: String, default: "", trim: true, maxlength: 40 },
    heightCm: { type: Number, default: null, min: 0, max: 300 },
    currentWeightKg: { type: Number, default: null, min: 0, max: 1_000 },
    targetWeightKg: { type: Number, default: null, min: 0, max: 1_000 },
    ageAtBaseline: { type: Number, default: null, min: 0, max: 150 },
    sex: {
      type: String,
      default: null,
      enum: ["male", "female", "other", "prefer_not_to_say", null],
    },
    timezone: { type: String, default: null, trim: true, maxlength: 100 },
    startDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    weeklyWorkoutTarget: { type: Number, default: null, min: 1, max: 7 },
    rules: {
      type: [
        new Schema(
          {
            key: {
              type: String,
              required: true,
              enum: DAILY_RULE_CATALOGUE.map((rule) => rule.key),
            },
            target: { type: Number, default: null, min: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { collection: "onboarding_drafts", timestamps: true },
);

onboardingDraftSchema.index(
  { userId: 1 },
  { unique: true, name: "unique_onboarding_draft_per_user" },
);

export const OnboardingDraftModel: Model<OnboardingDraftDocument> =
  (mongoose.models.OnboardingDraft as Model<OnboardingDraftDocument> | undefined) ??
  mongoose.model<OnboardingDraftDocument>("OnboardingDraft", onboardingDraftSchema);
