import "server-only";

import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import {
  GuildConnectionModel,
  type GuildConnectionDocument,
} from "@/server/models/guild-connection";
import { GuildInviteModel } from "@/server/models/guild-invite";

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === 11000
  );
}

export function createGuildPairKey(firstUserId: string, secondUserId: string): string {
  if (firstUserId === secondUserId) throw new AppError("CANNOT_INVITE_SELF");
  return [firstUserId, secondUserId].sort().join(":");
}

function memberIds(pairKey: string) {
  const [userAId, userBId] = pairKey.split(":");
  if (!userAId || !userBId) throw new AppError("INTERNAL_ERROR");
  return { userAId, userBId };
}

export async function getGuildConnection(firstUserId: string, secondUserId: string) {
  await connectToDatabase();
  return GuildConnectionModel.findOne({
    pairKey: createGuildPairKey(firstUserId, secondUserId),
  });
}

export async function requireActiveGuildConnection(
  requesterUserId: string,
  memberUserId: string,
): Promise<GuildConnectionDocument> {
  const connection = await getGuildConnection(requesterUserId, memberUserId);
  if (!connection || connection.status !== "ACTIVE") {
    throw new AppError("GUILD_ACCESS_DENIED");
  }
  return connection;
}

export async function activateGuildConnection(
  firstUserId: string,
  secondUserId: string,
  now = new Date(),
): Promise<GuildConnectionDocument> {
  await connectToDatabase();
  await GuildConnectionModel.init();
  const pairKey = createGuildPairKey(firstUserId, secondUserId);
  const existing = await GuildConnectionModel.findOne({ pairKey });
  if (existing?.status === "BLOCKED") throw new AppError("GUILD_BLOCKED");
  const ids = memberIds(pairKey);
  try {
    const connection = await GuildConnectionModel.findOneAndUpdate(
      { pairKey, status: { $ne: "BLOCKED" } },
      {
        $setOnInsert: { pairKey, ...ids },
        $set: {
          status: "ACTIVE",
          acceptedAt: now,
          removedAt: null,
          blockedByUserId: null,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    if (!connection) throw new AppError("INTERNAL_ERROR");
    return connection;
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const connection = await GuildConnectionModel.findOne({ pairKey });
    if (connection?.status === "BLOCKED") throw new AppError("GUILD_BLOCKED");
    if (!connection) throw error;
    return connection;
  }
}

export async function getActiveGuildMemberIds(userId: string): Promise<string[]> {
  await connectToDatabase();
  const connections = await GuildConnectionModel.find({
    status: "ACTIVE",
    $or: [{ userAId: userId }, { userBId: userId }],
  }).sort({ acceptedAt: 1, _id: 1 });
  return connections.map((connection) =>
    connection.userAId.toString() === userId
      ? connection.userBId.toString()
      : connection.userAId.toString(),
  );
}

export async function removeGuildMember(
  requesterUserId: string,
  memberUserId: string,
  now = new Date(),
) {
  await connectToDatabase();
  const connection = await GuildConnectionModel.findOneAndUpdate(
    {
      pairKey: createGuildPairKey(requesterUserId, memberUserId),
      status: "ACTIVE",
    },
    {
      $set: { status: "REMOVED", removedAt: now, blockedByUserId: null },
    },
    { new: true },
  );
  if (!connection) throw new AppError("GUILD_MEMBER_NOT_FOUND");
  return { memberId: memberUserId, status: connection.status } as const;
}

export async function blockGuildMember(
  requesterUserId: string,
  memberUserId: string,
  now = new Date(),
) {
  const active = await requireActiveGuildConnection(requesterUserId, memberUserId);
  const connection = await GuildConnectionModel.findOneAndUpdate(
    { _id: active._id, status: "ACTIVE" },
    {
      $set: {
        status: "BLOCKED",
        removedAt: now,
        blockedByUserId: requesterUserId,
      },
    },
    { new: true },
  );
  if (!connection) throw new AppError("GUILD_MEMBER_NOT_FOUND");
  await GuildInviteModel.updateMany(
    {
      status: "PENDING",
      $or: [
        { inviterUserId: requesterUserId, inviteeUserId: memberUserId },
        { inviterUserId: memberUserId, inviteeUserId: requesterUserId },
      ],
    },
    { $set: { status: "CANCELLED", cancelledAt: now } },
  );
  return { memberId: memberUserId, status: connection.status } as const;
}
