import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";
import { AVATAR_KEYS, type AvatarKey } from "@/lib/avatar-catalogue";

export interface UserProfileDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  displayName: string;
  dateOfBirth: Date | null;
  ageAtBaseline: number | null;
  sex: "male" | "female" | "other" | "prefer_not_to_say" | null;
  heightCm: number | null;
  preferredWeightUnit: "kg" | "lb";
  preferredDistanceUnit: "km" | "mi";
  timezone: string;
  selectedTitle: string | null;
  avatarKey: AvatarKey | null;
  createdAt: Date;
  updatedAt: Date;
}

const userProfileSchema = new Schema<UserProfileDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Owner",
      unique: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 40,
    },
    dateOfBirth: { type: Date, default: null },
    ageAtBaseline: { type: Number, default: null, min: 0, max: 150 },
    sex: {
      type: String,
      default: null,
      enum: ["male", "female", "other", "prefer_not_to_say", null],
    },
    heightCm: { type: Number, default: null, min: 0 },
    preferredWeightUnit: { type: String, required: true, enum: ["kg", "lb"] },
    preferredDistanceUnit: { type: String, required: true, enum: ["km", "mi"] },
    timezone: { type: String, required: true, trim: true, maxlength: 100 },
    selectedTitle: { type: String, default: null, trim: true, maxlength: 50 },
    avatarKey: { type: String, default: null, enum: [...AVATAR_KEYS, null] },
  },
  {
    collection: "user_profiles",
    timestamps: true,
  },
);

export const UserProfileModel: Model<UserProfileDocument> =
  (mongoose.models.UserProfile as Model<UserProfileDocument> | undefined) ??
  mongoose.model<UserProfileDocument>("UserProfile", userProfileSchema);
