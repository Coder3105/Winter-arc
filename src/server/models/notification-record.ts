import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export const NOTIFICATION_TYPES = [
  "DAILY_QUEST",
  "MORNING_WEIGHT",
  "HYDRATION",
  "STEPS",
  "WORKOUT_AT_RISK",
  "WORKOUT_CRITICAL",
  "WORKOUT_FAILED",
  "RECOVERY",
  "RECOVERY_CLEARED",
  "WEEKLY_REPORT_READY",
  "ACHIEVEMENT",
  "REWARD",
  "LEVEL_UP",
  "RANK_UP",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];
export const NOTIFICATION_STATUSES = ["UNREAD", "READ", "DISMISSED"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
export const NOTIFICATION_DELIVERY_STATES = [
  "IN_APP_READY",
  "PUSH_PENDING",
  "PUSH_DELIVERED",
  "PUSH_UNAVAILABLE",
  "PUSH_FAILED",
] as const;
export type NotificationDeliveryState = (typeof NOTIFICATION_DELIVERY_STATES)[number];

export interface NotificationRecordDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  winterArcConfigId: Types.ObjectId | null;
  type: NotificationType;
  dedupeKey: string;
  policyVersion: number;
  title: string;
  body: string;
  privateTitle: string | null;
  privateBody: string | null;
  actionRoute: string;
  sourceType: "TIME_BASED" | "EVENT_BASED";
  sourceKey: string | null;
  challengeDay: number | null;
  challengeWeek: number | null;
  sourceDate: string | null;
  priority: NotificationPriority;
  status: NotificationStatus;
  scheduledFor: Date | null;
  generatedAt: Date;
  readAt: Date | null;
  dismissedAt: Date | null;
  delivery: NotificationDeliveryState;
  pushAttemptedAt: Date | null;
  pushDeliveredAt: Date | null;
  pushSuccessCount: number;
  pushFailureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<NotificationRecordDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner" },
    winterArcConfigId: {
      type: Schema.Types.ObjectId,
      default: null,
      ref: "WinterArcConfig",
    },
    type: { type: String, required: true, enum: NOTIFICATION_TYPES },
    dedupeKey: { type: String, required: true, trim: true, maxlength: 220 },
    policyVersion: { type: Number, required: true, min: 1, immutable: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    privateTitle: { type: String, default: null, trim: true, maxlength: 120 },
    privateBody: { type: String, default: null, trim: true, maxlength: 800 },
    actionRoute: { type: String, required: true, trim: true, maxlength: 160 },
    sourceType: {
      type: String,
      required: true,
      enum: ["TIME_BASED", "EVENT_BASED"],
    },
    sourceKey: { type: String, default: null, trim: true, maxlength: 180 },
    challengeDay: { type: Number, default: null, min: 1 },
    challengeWeek: { type: Number, default: null, min: 1 },
    sourceDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    priority: { type: String, required: true, enum: NOTIFICATION_PRIORITIES },
    status: {
      type: String,
      required: true,
      enum: NOTIFICATION_STATUSES,
      default: "UNREAD",
    },
    scheduledFor: { type: Date, default: null },
    generatedAt: { type: Date, required: true },
    readAt: { type: Date, default: null },
    dismissedAt: { type: Date, default: null },
    delivery: {
      type: String,
      required: true,
      enum: NOTIFICATION_DELIVERY_STATES,
      default: "IN_APP_READY",
    },
    pushAttemptedAt: { type: Date, default: null },
    pushDeliveredAt: { type: Date, default: null },
    pushSuccessCount: { type: Number, required: true, default: 0, min: 0 },
    pushFailureCount: { type: Number, required: true, default: 0, min: 0 },
  },
  { collection: "notification_records", timestamps: true },
);

schema.index(
  { userId: 1, winterArcConfigId: 1, dedupeKey: 1, policyVersion: 1 },
  { unique: true, name: "unique_notification_dedupe" },
);
schema.index({ userId: 1, status: 1, createdAt: -1 }, { name: "notification_inbox" });

export const NotificationRecordModel: Model<NotificationRecordDocument> =
  (mongoose.models.NotificationRecord as Model<NotificationRecordDocument> | undefined) ??
  mongoose.model<NotificationRecordDocument>("NotificationRecord", schema);
