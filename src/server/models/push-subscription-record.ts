import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export interface PushSubscriptionRecordDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  endpoint: string;
  endpointHash: string;
  keys: { p256dh: string; auth: string };
  expirationTime: number | null;
  status: "ACTIVE" | "INVALID";
  lastSeenAt: Date;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<PushSubscriptionRecordDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "Owner" },
    endpoint: { type: String, required: true, maxlength: 2048, select: false },
    endpointHash: { type: String, required: true, maxlength: 64, immutable: true },
    keys: {
      type: new Schema(
        {
          p256dh: { type: String, required: true, maxlength: 512, select: false },
          auth: { type: String, required: true, maxlength: 512, select: false },
        },
        { _id: false },
      ),
      required: true,
      select: false,
    },
    expirationTime: { type: Number, default: null, min: 0 },
    status: {
      type: String,
      required: true,
      enum: ["ACTIVE", "INVALID"],
      default: "ACTIVE",
    },
    lastSeenAt: { type: Date, required: true },
    lastSuccessAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
    failureCount: { type: Number, required: true, default: 0, min: 0 },
  },
  { collection: "push_subscription_records", timestamps: true },
);

schema.index({ endpointHash: 1 }, { unique: true, name: "unique_push_endpoint_hash" });
schema.index(
  { userId: 1, status: 1, updatedAt: -1 },
  { name: "owner_push_subscriptions" },
);

export const PushSubscriptionRecordModel: Model<PushSubscriptionRecordDocument> =
  (mongoose.models.PushSubscriptionRecord as
    Model<PushSubscriptionRecordDocument> | undefined) ??
  mongoose.model<PushSubscriptionRecordDocument>("PushSubscriptionRecord", schema);
