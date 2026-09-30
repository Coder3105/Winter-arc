import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export const WEIGHT_SOURCES = ["MANUAL", "BODY_COMPOSITION"] as const;
export type WeightSource = (typeof WEIGHT_SOURCES)[number];

export interface WeightRecordDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  winterArcConfigId: Types.ObjectId;
  date: string;
  timezone: string;
  challengeDay: number;
  challengeWeek: number;
  weightKg: number;
  source: WeightSource;
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const weightRecordSchema = new Schema<WeightRecordDocument>(
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
    weightKg: { type: Number, required: true, min: 20, max: 500 },
    source: { type: String, required: true, enum: WEIGHT_SOURCES },
    recordedAt: { type: Date, required: true },
  },
  { collection: "weight_records", timestamps: true },
);

weightRecordSchema.index(
  { userId: 1, winterArcConfigId: 1, date: 1 },
  { unique: true, name: "unique_weight_per_protocol_day" },
);

export const WeightRecordModel: Model<WeightRecordDocument> =
  (mongoose.models.WeightRecord as Model<WeightRecordDocument> | undefined) ??
  mongoose.model<WeightRecordDocument>("WeightRecord", weightRecordSchema);
