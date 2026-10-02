import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";
import {
  OTP_MAX_ATTEMPTS,
  OTP_PURPOSES,
  OTP_STATUSES,
  type OtpPurpose,
  type OtpStatus,
} from "@/server/auth/otp-policy";

export interface EmailOtpDocument {
  _id: Types.ObjectId;
  emailNormalized: string;
  purpose: OtpPurpose;
  contextKey: string | null;
  requestId: string;
  otpHash: string;
  status: OtpStatus;
  expiresAt: Date;
  attemptCount: number;
  maxAttempts: number;
  lastSentAt: Date;
  sendCount: number;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<EmailOtpDocument>(
  {
    emailNormalized: { type: String, required: true, trim: true, maxlength: 320 },
    purpose: { type: String, required: true, enum: OTP_PURPOSES },
    contextKey: { type: String, default: null, maxlength: 64 },
    requestId: { type: String, required: true, maxlength: 64 },
    otpHash: { type: String, required: true, select: false, maxlength: 64 },
    status: { type: String, required: true, enum: OTP_STATUSES },
    expiresAt: { type: Date, required: true },
    attemptCount: { type: Number, required: true, min: 0, default: 0 },
    maxAttempts: { type: Number, required: true, min: 1, default: OTP_MAX_ATTEMPTS },
    lastSentAt: { type: Date, required: true },
    sendCount: { type: Number, required: true, min: 1, default: 1 },
    consumedAt: { type: Date, default: null },
  },
  { collection: "email_otps", timestamps: true },
);

schema.index(
  { emailNormalized: 1, purpose: 1, contextKey: 1 },
  { unique: true, name: "unique_email_otp_context" },
);
schema.index({ requestId: 1 }, { unique: true, name: "unique_email_otp_request" });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "email_otp_expiration" });

export const EmailOtpModel: Model<EmailOtpDocument> =
  (mongoose.models.EmailOtp as Model<EmailOtpDocument> | undefined) ??
  mongoose.model<EmailOtpDocument>("EmailOtp", schema);
