import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export const REWARD_TYPES = [
  "DAILY_CLEAR",
  "PERFECT_WEEK",
  "WORKOUT_WEEK",
  "LEVEL_MILESTONE",
] as const;
export type RewardType = (typeof REWARD_TYPES)[number];

export interface RewardGrantDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  winterArcConfigId: Types.ObjectId;
  rewardType: RewardType;
  rewardKey: string;
  sourceType: string;
  sourceKey: string;
  status: "ACTIVE" | "REVOKED";
  grantedAt: Date;
  revokedAt: Date | null;
  claimedAt: Date | null;
  title: string;
  description: string;
  rewardVersion: number;
  challengeDay: number | null;
  challengeWeek: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<RewardGrantDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner" },
    winterArcConfigId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "WinterArcConfig",
    },
    rewardType: { type: String, required: true, enum: REWARD_TYPES },
    rewardKey: { type: String, required: true, trim: true, maxlength: 160 },
    sourceType: { type: String, required: true, trim: true, maxlength: 60 },
    sourceKey: { type: String, required: true, trim: true, maxlength: 160 },
    status: { type: String, required: true, enum: ["ACTIVE", "REVOKED"] },
    grantedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 300 },
    rewardVersion: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    challengeDay: { type: Number, default: null, min: 1 },
    challengeWeek: { type: Number, default: null, min: 1 },
  },
  { collection: "reward_grants", timestamps: true },
);

schema.index(
  { userId: 1, winterArcConfigId: 1, rewardType: 1, rewardKey: 1 },
  { unique: true, name: "unique_reward_grant" },
);
schema.index({ userId: 1, winterArcConfigId: 1, status: 1 }, { name: "reward_status" });

export const RewardGrantModel: Model<RewardGrantDocument> =
  (mongoose.models.RewardGrant as Model<RewardGrantDocument> | undefined) ??
  mongoose.model<RewardGrantDocument>("RewardGrant", schema);
