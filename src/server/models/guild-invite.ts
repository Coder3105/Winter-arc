import "server-only";

import mongoose, { type Model, Schema, type Types } from "mongoose";

import {
  GUILD_INVITE_STATUSES,
  type GuildInviteStatus,
} from "@/server/guild/guild-policy";

export interface GuildInviteDocument {
  _id: Types.ObjectId;
  inviterUserId: Types.ObjectId;
  inviteeEmailNormalized: string;
  inviteeUserId: Types.ObjectId | null;
  status: GuildInviteStatus;
  expiresAt: Date;
  otpRequestId: string | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<GuildInviteDocument>(
  {
    inviterUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Owner",
      immutable: true,
    },
    inviteeEmailNormalized: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 320,
      immutable: true,
    },
    inviteeUserId: {
      type: Schema.Types.ObjectId,
      ref: "Owner",
      default: null,
    },
    status: { type: String, required: true, enum: GUILD_INVITE_STATUSES },
    expiresAt: { type: Date, required: true, immutable: true },
    otpRequestId: { type: String, default: null, maxlength: 64 },
    acceptedAt: { type: Date, default: null },
    declinedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { collection: "guild_invites", timestamps: true },
);

schema.index(
  { inviterUserId: 1, inviteeEmailNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PENDING" },
    name: "unique_pending_guild_invite_target",
  },
);
schema.index(
  { inviteeEmailNormalized: 1, status: 1, createdAt: -1 },
  { name: "guild_invite_incoming_email" },
);
schema.index(
  { inviteeUserId: 1, status: 1, createdAt: -1 },
  { name: "guild_invite_incoming_user" },
);
schema.index(
  { inviterUserId: 1, status: 1, createdAt: -1 },
  { name: "guild_invite_outgoing" },
);
schema.index({ status: 1, expiresAt: 1 }, { name: "guild_invite_expiration" });

export const GuildInviteModel: Model<GuildInviteDocument> =
  (mongoose.models.GuildInvite as Model<GuildInviteDocument> | undefined) ??
  mongoose.model<GuildInviteDocument>("GuildInvite", schema);
