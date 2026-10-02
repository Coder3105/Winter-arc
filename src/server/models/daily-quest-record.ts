import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

import { RULE_TYPES, type RuleType } from "@/features/winter-arc/rules";

export interface DailyQuestRuleSnapshotDocument {
  key: string;
  name: string;
  type: RuleType;
  target: number | null;
  unit: string | null;
  requiredFrequency: number;
  order: number;
}

export interface DailyQuestResponseDocument {
  kind: "BOOLEAN" | "NUMERIC";
  booleanValue?: boolean;
  numericValue?: number;
  recordedAt: Date;
}

export interface DailyQuestRecordDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  winterArcConfigId: Types.ObjectId;
  date: string;
  timezone: string;
  challengeDay: number;
  challengeWeek: number;
  ruleSnapshot: DailyQuestRuleSnapshotDocument[];
  responses: Map<string, DailyQuestResponseDocument>;
  completedAt: Date | null;
  dailyNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ruleSnapshotSchema = new Schema<DailyQuestRuleSnapshotDocument>(
  {
    key: { type: String, required: true, trim: true, maxlength: 60 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    type: { type: String, required: true, enum: RULE_TYPES },
    target: { type: Number, default: null, min: 0 },
    unit: { type: String, default: null, maxlength: 30 },
    requiredFrequency: { type: Number, required: true, min: 1, max: 7 },
    order: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const responseSchema = new Schema<DailyQuestResponseDocument>(
  {
    kind: { type: String, required: true, enum: ["BOOLEAN", "NUMERIC"] },
    booleanValue: { type: Boolean },
    numericValue: { type: Number, min: 0 },
    recordedAt: { type: Date, required: true },
  },
  { _id: false },
);

const dailyQuestRecordSchema = new Schema<DailyQuestRecordDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner" },
    winterArcConfigId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "WinterArcConfig",
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    timezone: { type: String, required: true, trim: true, maxlength: 100 },
    challengeDay: { type: Number, required: true, min: 1 },
    challengeWeek: { type: Number, required: true, min: 1 },
    ruleSnapshot: { type: [ruleSnapshotSchema], required: true },
    responses: { type: Map, of: responseSchema, default: () => new Map() },
    completedAt: { type: Date, default: null },
    dailyNote: { type: String, default: null, maxlength: 2_000 },
  },
  {
    collection: "daily_quest_records",
    timestamps: true,
  },
);

dailyQuestRecordSchema.index(
  { userId: 1, winterArcConfigId: 1, date: 1 },
  { unique: true, name: "unique_daily_quest_per_protocol" },
);
dailyQuestRecordSchema.index({ userId: 1, date: -1 });

if (process.env.NODE_ENV === "development" && mongoose.models.DailyQuestRecord) {
  mongoose.deleteModel("DailyQuestRecord");
}

export const DailyQuestRecordModel: Model<DailyQuestRecordDocument> =
  (mongoose.models.DailyQuestRecord as Model<DailyQuestRecordDocument> | undefined) ??
  mongoose.model<DailyQuestRecordDocument>("DailyQuestRecord", dailyQuestRecordSchema);
