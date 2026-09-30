import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export interface AuthSessionDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
  userAgent: string | null;
  revokedAt: Date | null;
}

const authSessionSchema = new Schema<AuthSessionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Owner",
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true },
    userAgent: { type: String, default: null, maxlength: 500 },
    revokedAt: { type: Date, default: null },
  },
  {
    collection: "auth_sessions",
    timestamps: true,
  },
);

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSessionModel: Model<AuthSessionDocument> =
  (mongoose.models.AuthSession as Model<AuthSessionDocument> | undefined) ??
  mongoose.model<AuthSessionDocument>("AuthSession", authSessionSchema);
