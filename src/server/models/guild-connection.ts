import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

import {
  GUILD_CONNECTION_STATUSES,
  type GuildConnectionStatus,
} from "@/server/guild/guild-policy";

export interface GuildConnectionDocument {
  _id: Types.ObjectId;
  userAId: Types.ObjectId;
  userBId: Types.ObjectId;
  pairKey: string;
  status: GuildConnectionStatus;
  acceptedAt: Date;
  removedAt: Date | null;
  blockedByUserId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<GuildConnectionDocument>(
  {
    userAId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Owner",
      immutable: true,
    },
    userBId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Owner",
      immutable: true,
    },
    pairKey: { type: String, required: true, immutable: true, maxlength: 49 },
    status: { type: String, required: true, enum: GUILD_CONNECTION_STATUSES },
    acceptedAt: { type: Date, required: true },
    removedAt: { type: Date, default: null },
    blockedByUserId: { type: Schema.Types.ObjectId, ref: "Owner", default: null },
  },
  { collection: "guild_connections", timestamps: true },
);

schema.index({ pairKey: 1 }, { unique: true, name: "unique_guild_pair" });
schema.index(
  { userAId: 1, status: 1, updatedAt: -1 },
  { name: "guild_connections_user_a" },
);
schema.index(
  { userBId: 1, status: 1, updatedAt: -1 },
  { name: "guild_connections_user_b" },
);

export const GuildConnectionModel: Model<GuildConnectionDocument> =
  (mongoose.models.GuildConnection as Model<GuildConnectionDocument> | undefined) ??
  mongoose.model<GuildConnectionDocument>("GuildConnection", schema);
