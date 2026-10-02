import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";
import { normalizeEmail } from "@/lib/auth/email";

export const ACCOUNT_STATUSES = ["ACTIVE", "PENDING_VERIFICATION", "DISABLED"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface OwnerDocument {
  _id: Types.ObjectId;
  email: string;
  emailNormalized: string;
  emailVerifiedAt: Date | null;
  status: AccountStatus;
  isOriginalOwner: boolean;
  passwordHash: string;
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

const ownerSchema = new Schema<OwnerDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      set: normalizeEmail,
      trim: true,
      maxlength: 320,
    },
    emailNormalized: {
      type: String,
      required: true,
      set: normalizeEmail,
      maxlength: 320,
    },
    emailVerifiedAt: { type: Date, default: null },
    status: { type: String, required: true, enum: ACCOUNT_STATUSES },
    isOriginalOwner: { type: Boolean, default: false, immutable: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    isActive: { type: Boolean, required: true, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  {
    collection: "owners",
    timestamps: true,
    // Index rollout is explicit: preflight duplicates, backfill, then create indexes.
    autoIndex: false,
  },
);

ownerSchema.index(
  { emailNormalized: 1 },
  { unique: true, name: "unique_user_email_normalized" },
);
ownerSchema.index(
  { isOriginalOwner: 1 },
  {
    unique: true,
    partialFilterExpression: { isOriginalOwner: true },
    name: "unique_original_owner",
  },
);
ownerSchema.pre("validate", function () {
  if (this.email) this.emailNormalized = normalizeEmail(this.email);
});

export const OwnerModel: Model<OwnerDocument> =
  (mongoose.models.Owner as Model<OwnerDocument> | undefined) ??
  mongoose.model<OwnerDocument>("Owner", ownerSchema);

// One model/collection/identity, not a second account entity. Legacy refs remain valid.
export const UserModel = OwnerModel;
export type UserDocument = OwnerDocument;
