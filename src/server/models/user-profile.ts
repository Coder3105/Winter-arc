import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

export interface UserProfileDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  displayName: string;
  dateOfBirth: Date | null;
  ageAtBaseline: number;
  sex: "male" | "female" | "other" | "prefer_not_to_say";
  heightCm: number;
  preferredWeightUnit: "kg" | "lb";
  preferredDistanceUnit: "km" | "mi";
  timezone: string;
  selectedTitle: string | null;
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
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    dateOfBirth: { type: Date, default: null },
    ageAtBaseline: { type: Number, required: true, min: 0, max: 150 },
    sex: {
      type: String,
      required: true,
      enum: ["male", "female", "other", "prefer_not_to_say"],
    },
    heightCm: { type: Number, required: true, min: 0 },
    preferredWeightUnit: { type: String, required: true, enum: ["kg", "lb"] },
    preferredDistanceUnit: { type: String, required: true, enum: ["km", "mi"] },
    timezone: { type: String, required: true, trim: true, maxlength: 100 },
    selectedTitle: { type: String, default: null, trim: true, maxlength: 50 },
  },
  {
    collection: "user_profiles",
    timestamps: true,
  },
);

export const UserProfileModel: Model<UserProfileDocument> =
  (mongoose.models.UserProfile as Model<UserProfileDocument> | undefined) ??
  mongoose.model<UserProfileDocument>("UserProfile", userProfileSchema);
