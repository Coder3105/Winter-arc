import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export const AUTH_RATE_LIMIT_SCOPES = [
  "OTP_EMAIL_SEND",
  "OTP_IP_REQUEST",
  "OTP_IP_VERIFY",
  "GUILD_INVITER_SEND",
  "GUILD_TARGET_SEND",
] as const;
export type AuthRateLimitScope = (typeof AUTH_RATE_LIMIT_SCOPES)[number];

export interface AuthRateLimitDocument {
  _id: Types.ObjectId;
  scope: AuthRateLimitScope;
  subjectHash: string;
  windowStartedAt: Date;
  count: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<AuthRateLimitDocument>(
  {
    scope: { type: String, required: true, enum: AUTH_RATE_LIMIT_SCOPES },
    subjectHash: { type: String, required: true, maxlength: 64 },
    windowStartedAt: { type: Date, required: true },
    count: { type: Number, required: true, min: 1, default: 1 },
    expiresAt: { type: Date, required: true },
  },
  { collection: "auth_rate_limits", timestamps: true },
);

schema.index(
  { scope: 1, subjectHash: 1, windowStartedAt: 1 },
  { unique: true, name: "unique_auth_rate_window" },
);
schema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "auth_rate_limit_expiration" },
);

export const AuthRateLimitModel: Model<AuthRateLimitDocument> =
  (mongoose.models.AuthRateLimit as Model<AuthRateLimitDocument> | undefined) ??
  mongoose.model<AuthRateLimitDocument>("AuthRateLimit", schema);
