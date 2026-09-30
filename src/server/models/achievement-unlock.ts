import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

import { ACHIEVEMENT_CATEGORIES } from "@/server/achievements/achievement-policy";

export interface AchievementUnlockDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  winterArcConfigId: Types.ObjectId;
  achievementKey: string;
  achievementVersion: number;
  category: (typeof ACHIEVEMENT_CATEGORIES)[number];
  status: "ACTIVE" | "REVOKED";
  unlockedAt: Date;
  revokedAt: Date | null;
  sourceType: string;
  sourceKey: string | null;
  challengeDay: number | null;
  challengeWeek: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<AchievementUnlockDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner" },
    winterArcConfigId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "WinterArcConfig",
    },
    achievementKey: { type: String, required: true, trim: true, maxlength: 80 },
    achievementVersion: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    category: { type: String, required: true, enum: ACHIEVEMENT_CATEGORIES },
    status: { type: String, required: true, enum: ["ACTIVE", "REVOKED"] },
    unlockedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    sourceType: { type: String, required: true, trim: true, maxlength: 60 },
    sourceKey: { type: String, default: null, trim: true, maxlength: 160 },
    challengeDay: { type: Number, default: null, min: 1 },
    challengeWeek: { type: Number, default: null, min: 1 },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { collection: "achievement_unlocks", timestamps: true },
);

schema.index(
  { userId: 1, winterArcConfigId: 1, achievementKey: 1, achievementVersion: 1 },
  { unique: true, name: "unique_achievement_unlock" },
);
schema.index(
  { userId: 1, winterArcConfigId: 1, status: 1 },
  { name: "achievement_status" },
);

export const AchievementUnlockModel: Model<AchievementUnlockDocument> =
  (mongoose.models.AchievementUnlock as Model<AchievementUnlockDocument> | undefined) ??
  mongoose.model<AchievementUnlockDocument>("AchievementUnlock", schema);
