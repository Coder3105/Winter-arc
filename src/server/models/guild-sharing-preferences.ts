import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

import { DEFAULT_GUILD_SHARING } from "@/lib/guild/sharing";

export interface GuildSharingPreferencesDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  shareProfileSummary: boolean;
  shareCalendar: boolean;
  shareWeeklyReports: boolean;
  shareProgression: boolean;
  shareWorkoutSummary: boolean;
  shareWeight: boolean;
  shareBodyComposition: boolean;
  sharePrivateHabits: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<GuildSharingPreferencesDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Owner",
      immutable: true,
    },
    shareProfileSummary: {
      type: Boolean,
      required: true,
      default: DEFAULT_GUILD_SHARING.shareProfileSummary,
    },
    shareCalendar: {
      type: Boolean,
      required: true,
      default: DEFAULT_GUILD_SHARING.shareCalendar,
    },
    shareWeeklyReports: {
      type: Boolean,
      required: true,
      default: DEFAULT_GUILD_SHARING.shareWeeklyReports,
    },
    shareProgression: {
      type: Boolean,
      required: true,
      default: DEFAULT_GUILD_SHARING.shareProgression,
    },
    shareWorkoutSummary: {
      type: Boolean,
      required: true,
      default: DEFAULT_GUILD_SHARING.shareWorkoutSummary,
    },
    shareWeight: {
      type: Boolean,
      required: true,
      default: DEFAULT_GUILD_SHARING.shareWeight,
    },
    shareBodyComposition: {
      type: Boolean,
      required: true,
      default: DEFAULT_GUILD_SHARING.shareBodyComposition,
    },
    sharePrivateHabits: {
      type: Boolean,
      required: true,
      default: DEFAULT_GUILD_SHARING.sharePrivateHabits,
    },
  },
  { collection: "guild_sharing_preferences", timestamps: true },
);

schema.index({ userId: 1 }, { unique: true, name: "unique_guild_sharing_owner" });

export const GuildSharingPreferencesModel: Model<GuildSharingPreferencesDocument> =
  (mongoose.models.GuildSharingPreferences as
    Model<GuildSharingPreferencesDocument> | undefined) ??
  mongoose.model<GuildSharingPreferencesDocument>("GuildSharingPreferences", schema);
