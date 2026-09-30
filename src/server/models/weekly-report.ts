import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export interface WeeklyReportDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  winterArcConfigId: Types.ObjectId;
  challengeWeek: number;
  weekStartDate: string;
  weekEndDate: string;
  reportPolicyVersion: number;
  status: "FINAL";
  generatedAt: Date;
  snapshot: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<WeeklyReportDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Owner",
      immutable: true,
    },
    winterArcConfigId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "WinterArcConfig",
      immutable: true,
    },
    challengeWeek: { type: Number, required: true, min: 1, immutable: true },
    weekStartDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      immutable: true,
    },
    weekEndDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      immutable: true,
    },
    reportPolicyVersion: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
      immutable: true,
    },
    status: { type: String, required: true, enum: ["FINAL"], immutable: true },
    generatedAt: { type: Date, required: true, immutable: true },
    snapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
  },
  { collection: "weekly_reports", timestamps: true },
);

schema.index(
  { userId: 1, winterArcConfigId: 1, challengeWeek: 1, reportPolicyVersion: 1 },
  { unique: true, name: "unique_final_weekly_report" },
);
schema.index(
  { userId: 1, winterArcConfigId: 1, challengeWeek: -1 },
  { name: "weekly_report_history" },
);

export const WeeklyReportModel: Model<WeeklyReportDocument> =
  (mongoose.models.WeeklyReport as Model<WeeklyReportDocument> | undefined) ??
  mongoose.model<WeeklyReportDocument>("WeeklyReport", schema);
