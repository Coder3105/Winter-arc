export const GUILD_INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const GUILD_INVITER_SEND_LIMIT = 10;
export const GUILD_TARGET_SEND_LIMIT = 5;
export const GUILD_SEND_WINDOW_SECONDS = 60 * 60;

export const GUILD_INVITE_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type GuildInviteStatus = (typeof GUILD_INVITE_STATUSES)[number];

export const GUILD_CONNECTION_STATUSES = ["ACTIVE", "REMOVED", "BLOCKED"] as const;
export type GuildConnectionStatus = (typeof GUILD_CONNECTION_STATUSES)[number];
