import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export const PROGRESSION_SOURCE_TYPES = [
  "DAILY_RULE",
  "PERFECT_DAY",
  "WORKOUT_DAY",
  "WEEKLY_WORKOUT",
] as const;
export type ProgressionSourceType = (typeof PROGRESSION_SOURCE_TYPES)[number];

export const PROGRESSION_EVENT_TYPES = [
  "DAILY_RULE_PASSED",
  "PERFECT_DAY_COMPLETED",
  "WORKOUT_DAY_COMPLETED",
  "WEEKLY_WORKOUT_SECURED",
] as const;
export type ProgressionEventType = (typeof PROGRESSION_EVENT_TYPES)[number];

export const PROGRESSION_EVENT_STATUSES = ["ACTIVE", "REVOKED"] as const;
export type ProgressionEventStatus = (typeof PROGRESSION_EVENT_STATUSES)[number];

export interface ProgressionEventDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  winterArcConfigId: Types.ObjectId;
  sourceType: ProgressionSourceType;
  sourceKey: string;
  sourceDocumentId: Types.ObjectId | null;
  sourceDate: string | null;
  challengeDay: number | null;
  challengeWeek: number | null;
  eventType: ProgressionEventType;
  xp: number;
  ruleVersion: number;
  status: ProgressionEventStatus;
  earnedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const progressionEventSchema = new Schema<ProgressionEventDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner" },
    winterArcConfigId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "WinterArcConfig",
    },
    sourceType: { type: String, required: true, enum: PROGRESSION_SOURCE_TYPES },
    sourceKey: { type: String, required: true, trim: true, maxlength: 160 },
    sourceDocumentId: { type: Schema.Types.ObjectId, default: null },
    sourceDate: {
      type: String,
      default: null,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    challengeDay: { type: Number, default: null, min: 1 },
    challengeWeek: { type: Number, default: null, min: 1 },
    eventType: { type: String, required: true, enum: PROGRESSION_EVENT_TYPES },
    xp: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    ruleVersion: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    status: { type: String, required: true, enum: PROGRESSION_EVENT_STATUSES },
    earnedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { collection: "progression_events", timestamps: true },
);

progressionEventSchema.index(
  { userId: 1, winterArcConfigId: 1, sourceType: 1, sourceKey: 1 },
  { unique: true, name: "unique_progression_source" },
);
progressionEventSchema.index(
  { userId: 1, winterArcConfigId: 1, status: 1, sourceDate: -1 },
  { name: "progression_active_date" },
);

export const ProgressionEventModel: Model<ProgressionEventDocument> =
  (mongoose.models.ProgressionEvent as Model<ProgressionEventDocument> | undefined) ??
  mongoose.model<ProgressionEventDocument>("ProgressionEvent", progressionEventSchema);
