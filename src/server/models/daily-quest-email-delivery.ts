import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export const DAILY_QUEST_EMAIL_DELIVERY_TYPE = "DAILY_QUEST_REMINDER" as const;
export const DAILY_QUEST_EMAIL_DELIVERY_STATES = [
  "PENDING",
  "SENDING",
  "SENT",
  "FAILED",
] as const;

export type DailyQuestEmailDeliveryState =
  (typeof DAILY_QUEST_EMAIL_DELIVERY_STATES)[number];

export interface DailyQuestEmailDeliveryDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  winterArcConfigId: Types.ObjectId;
  localDate: string;
  type: typeof DAILY_QUEST_EMAIL_DELIVERY_TYPE;
  timezone: string;
  state: DailyQuestEmailDeliveryState;
  attemptCount: number;
  claimedAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
  failureCode: "EMAIL_DELIVERY_FAILED" | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<DailyQuestEmailDeliveryDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner" },
    winterArcConfigId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "WinterArcConfig",
    },
    localDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    type: {
      type: String,
      required: true,
      enum: [DAILY_QUEST_EMAIL_DELIVERY_TYPE],
    },
    timezone: { type: String, required: true, trim: true, maxlength: 100 },
    state: {
      type: String,
      required: true,
      enum: DAILY_QUEST_EMAIL_DELIVERY_STATES,
      default: "PENDING",
    },
    attemptCount: { type: Number, required: true, min: 0, max: 3, default: 0 },
    claimedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureCode: {
      type: String,
      enum: ["EMAIL_DELIVERY_FAILED", null],
      default: null,
    },
  },
  { collection: "daily_quest_email_deliveries", timestamps: true },
);

schema.index(
  { userId: 1, winterArcConfigId: 1, localDate: 1, type: 1 },
  { unique: true, name: "unique_daily_quest_email_delivery" },
);
schema.index({ state: 1, updatedAt: 1 }, { name: "daily_quest_email_delivery_state" });

if (process.env.NODE_ENV === "development" && mongoose.models.DailyQuestEmailDelivery) {
  mongoose.deleteModel("DailyQuestEmailDelivery");
}

export const DailyQuestEmailDeliveryModel: Model<DailyQuestEmailDeliveryDocument> =
  (mongoose.models.DailyQuestEmailDelivery as
    Model<DailyQuestEmailDeliveryDocument> | undefined) ??
  mongoose.model<DailyQuestEmailDeliveryDocument>("DailyQuestEmailDelivery", schema);
