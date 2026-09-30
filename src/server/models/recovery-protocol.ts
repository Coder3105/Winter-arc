import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export const RECOVERY_TYPES = ["DAILY_RECOVERY", "WORKOUT_RECOVERY"] as const;
export type RecoveryType = (typeof RECOVERY_TYPES)[number];

export interface RecoveryProtocolDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  winterArcConfigId: Types.ObjectId;
  type: RecoveryType;
  sourceType: string;
  sourceKey: string;
  triggerKeys: string[];
  failureCount: number;
  triggerDate: string | null;
  challengeDay: number | null;
  challengeWeek: number | null;
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  assignedAt: Date;
  activatedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  requirementType: "FUTURE_PERFECT_DAY" | "NEXT_WEEKLY_MISSION";
  targetDate: string | null;
  targetWeek: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<RecoveryProtocolDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner" },
    winterArcConfigId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "WinterArcConfig",
    },
    type: { type: String, required: true, enum: RECOVERY_TYPES },
    sourceType: { type: String, required: true, trim: true, maxlength: 60 },
    sourceKey: { type: String, required: true, trim: true, maxlength: 160 },
    triggerKeys: { type: [String], required: true, default: [] },
    failureCount: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    triggerDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    challengeDay: { type: Number, default: null, min: 1 },
    challengeWeek: { type: Number, default: null, min: 1 },
    status: {
      type: String,
      required: true,
      enum: ["PENDING", "ACTIVE", "COMPLETED", "CANCELLED"],
    },
    assignedAt: { type: Date, required: true },
    activatedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    requirementType: {
      type: String,
      required: true,
      enum: ["FUTURE_PERFECT_DAY", "NEXT_WEEKLY_MISSION"],
    },
    targetDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    targetWeek: { type: Number, default: null, min: 1 },
  },
  { collection: "recovery_protocols", timestamps: true },
);

schema.index(
  { userId: 1, winterArcConfigId: 1, type: 1, sourceKey: 1 },
  { unique: true, name: "unique_recovery_source" },
);
schema.index(
  { userId: 1, winterArcConfigId: 1, status: 1, type: 1 },
  { name: "recovery_status_type" },
);

export const RecoveryProtocolModel: Model<RecoveryProtocolDocument> =
  (mongoose.models.RecoveryProtocol as Model<RecoveryProtocolDocument> | undefined) ??
  mongoose.model<RecoveryProtocolDocument>("RecoveryProtocol", schema);
