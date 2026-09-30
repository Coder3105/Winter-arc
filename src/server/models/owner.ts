import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export interface OwnerDocument {
  _id: Types.ObjectId;
  email: string;
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
      lowercase: true,
      trim: true,
      maxlength: 320,
    },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    isActive: { type: Boolean, required: true, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  {
    collection: "owners",
    timestamps: true,
  },
);

export const OwnerModel: Model<OwnerDocument> =
  (mongoose.models.Owner as Model<OwnerDocument> | undefined) ??
  mongoose.model<OwnerDocument>("Owner", ownerSchema);
