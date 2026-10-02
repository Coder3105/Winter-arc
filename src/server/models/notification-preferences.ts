import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

import type { NotificationPreferencesInput } from "@/lib/validation/notification-preferences";

export interface NotificationPreferencesDocument extends NotificationPreferencesInput {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  timezoneSnapshot: string;
  createdAt: Date;
  updatedAt: Date;
}

const toggleSchema = new Schema(
  { enabled: { type: Boolean, required: true } },
  { _id: false },
);
const timedToggleSchema = new Schema(
  {
    enabled: { type: Boolean, required: true },
    time: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
  },
  { _id: false },
);

const schema = new Schema<NotificationPreferencesDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner" },
    timezoneSnapshot: { type: String, required: true, trim: true, maxlength: 100 },
    enabled: { type: Boolean, required: true, default: false },
    dailyQuestEmailReminder: { type: Boolean, required: true, default: false },
    privacyMode: {
      type: String,
      required: true,
      enum: ["PRIVATE", "DETAILED"],
      default: "PRIVATE",
    },
    quietHours: {
      type: new Schema(
        {
          enabled: { type: Boolean, required: true },
          startLocalTime: {
            type: String,
            required: true,
            match: /^([01]\d|2[0-3]):[0-5]\d$/,
          },
          endLocalTime: {
            type: String,
            required: true,
            match: /^([01]\d|2[0-3]):[0-5]\d$/,
          },
        },
        { _id: false },
      ),
      required: true,
    },
    dailyQuest: { type: timedToggleSchema, required: true },
    morningWeight: { type: timedToggleSchema, required: true },
    hydration: {
      type: new Schema(
        {
          enabled: { type: Boolean, required: true },
          times: {
            type: [String],
            required: true,
            validate: {
              validator: (times: string[]) =>
                times.length <= 4 && new Set(times).size === times.length,
              message: "Hydration reminder times must be unique and limited to four.",
            },
          },
        },
        { _id: false },
      ),
      required: true,
    },
    steps: { type: timedToggleSchema, required: true },
    workout: { type: toggleSchema, required: true },
    recovery: { type: toggleSchema, required: true },
    weeklyReport: { type: timedToggleSchema, required: true },
    achievementReward: { type: toggleSchema, required: true },
  },
  { collection: "notification_preferences", timestamps: true },
);

schema.index({ userId: 1 }, { unique: true, name: "unique_notification_preferences" });
schema.index({ dailyQuestEmailReminder: 1, userId: 1 });

export const NotificationPreferencesModel: Model<NotificationPreferencesDocument> =
  (mongoose.models.NotificationPreferences as
    Model<NotificationPreferencesDocument> | undefined) ??
  mongoose.model<NotificationPreferencesDocument>("NotificationPreferences", schema);
