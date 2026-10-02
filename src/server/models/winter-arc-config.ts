import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

import { RULE_TYPES, type RuleType } from "@/features/winter-arc/rules";

export interface RuleDocument {
  key: string;
  name: string;
  category: string;
  enabled: boolean;
  type: RuleType;
  target: number | null;
  unit: string | null;
  requiredFrequency: number;
  order: number;
}

export interface WinterArcConfigDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  durationDays: number;
  startDate: Date;
  endDate: Date;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startingWeightKg: number | null;
  targetWeightKg: number | null;
  weeklyWorkoutTarget: number;
  rules: RuleDocument[];
  notificationPreferences: { enabled: boolean };
  createdAt: Date;
  updatedAt: Date;
}

const ruleSchema = new Schema<RuleDocument>(
  {
    key: { type: String, required: true, trim: true, maxlength: 60 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    category: { type: String, required: true, trim: true, maxlength: 50 },
    enabled: { type: Boolean, required: true },
    type: { type: String, required: true, enum: RULE_TYPES },
    target: { type: Number, default: null, min: 0 },
    unit: { type: String, default: null, maxlength: 30 },
    requiredFrequency: { type: Number, required: true, min: 1, max: 7 },
    order: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const winterArcConfigSchema = new Schema<WinterArcConfigDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner" },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    durationDays: { type: Number, required: true, min: 1, max: 365 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"],
      default: "DRAFT",
    },
    startingWeightKg: { type: Number, default: null, min: 0 },
    targetWeightKg: { type: Number, default: null, min: 0 },
    weeklyWorkoutTarget: { type: Number, required: true, min: 1, max: 7, default: 4 },
    rules: { type: [ruleSchema], required: true },
    notificationPreferences: {
      enabled: { type: Boolean, required: true, default: false },
    },
  },
  {
    collection: "winter_arc_configs",
    timestamps: true,
  },
);

winterArcConfigSchema.index({ userId: 1, status: 1 });
winterArcConfigSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
    name: "unique_active_winter_arc_per_user",
  },
);

// Next dev preserves mongoose.models across hot reloads, including obsolete validators.
if (process.env.NODE_ENV === "development" && mongoose.models.WinterArcConfig) {
  mongoose.deleteModel("WinterArcConfig");
}

export const WinterArcConfigModel: Model<WinterArcConfigDocument> =
  (mongoose.models.WinterArcConfig as Model<WinterArcConfigDocument> | undefined) ??
  mongoose.model<WinterArcConfigDocument>("WinterArcConfig", winterArcConfigSchema);
