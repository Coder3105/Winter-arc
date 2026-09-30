import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export const WORKOUT_TYPES = [
  "STRENGTH",
  "CARDIO",
  "SPORT",
  "MOBILITY",
  "MIXED",
  "OTHER",
] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

export interface WorkoutRecordDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  winterArcConfigId: Types.ObjectId;
  date: string;
  timezone: string;
  challengeDay: number;
  challengeWeek: number;
  type: WorkoutType;
  title: string | null;
  durationMinutes: number;
  notes: string | null;
  startedAt: Date | null;
  completedAt: Date;
  status: "COMPLETED";
  createdAt: Date;
  updatedAt: Date;
}

const workoutRecordSchema = new Schema<WorkoutRecordDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner" },
    winterArcConfigId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "WinterArcConfig",
    },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    timezone: { type: String, required: true, trim: true, maxlength: 100 },
    challengeDay: { type: Number, required: true, min: 1 },
    challengeWeek: { type: Number, required: true, min: 1 },
    type: { type: String, required: true, enum: WORKOUT_TYPES },
    title: { type: String, default: null, trim: true, maxlength: 100 },
    durationMinutes: { type: Number, required: true, min: 1, max: 1_440 },
    notes: { type: String, default: null, trim: true, maxlength: 2_000 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, required: true },
    status: { type: String, required: true, enum: ["COMPLETED"] },
  },
  { collection: "workout_records", timestamps: true },
);

workoutRecordSchema.index(
  { userId: 1, winterArcConfigId: 1, date: 1 },
  { name: "workout_owner_protocol_date" },
);

export const WorkoutRecordModel: Model<WorkoutRecordDocument> =
  (mongoose.models.WorkoutRecord as Model<WorkoutRecordDocument> | undefined) ??
  mongoose.model<WorkoutRecordDocument>("WorkoutRecord", workoutRecordSchema);
