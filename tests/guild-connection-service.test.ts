import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  init: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  find: vi.fn(),
  inviteUpdateMany: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/models/guild-connection", () => ({
  GuildConnectionModel: {
    init: mocks.init,
    findOne: mocks.findOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
    find: mocks.find,
  },
}));
vi.mock("@/server/models/guild-invite", () => ({
  GuildInviteModel: { updateMany: mocks.inviteUpdateMany },
}));

import {
  activateGuildConnection,
  blockGuildMember,
  getActiveGuildMemberIds,
  removeGuildMember,
  requireActiveGuildConnection,
} from "@/server/services/guild-connection-service";

const userA = "64b000000000000000000001";
const userB = "64b000000000000000000002";
const pairKey = `${userA}:${userB}`;
const now = new Date("2026-10-01T08:00:00.000Z");

describe("V2.4 Guild connection lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue({});
    mocks.init.mockResolvedValue(undefined);
    mocks.inviteUpdateMany.mockResolvedValue({ modifiedCount: 0 });
  });

  it("reactivates the same canonical pair after removal", async () => {
    mocks.findOne.mockResolvedValue({ pairKey, status: "REMOVED" });
    mocks.findOneAndUpdate.mockResolvedValue({ pairKey, status: "ACTIVE" });
    await expect(activateGuildConnection(userB, userA, now)).resolves.toMatchObject({
      pairKey,
      status: "ACTIVE",
    });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { pairKey, status: { $ne: "BLOCKED" } },
      {
        $setOnInsert: { pairKey, userAId: userA, userBId: userB },
        $set: {
          status: "ACTIVE",
          acceptedAt: now,
          removedAt: null,
          blockedByUserId: null,
        },
      },
      expect.objectContaining({ upsert: true, new: true }),
    );
  });

  it("never reactivates a blocked pair", async () => {
    mocks.findOne.mockResolvedValue({ pairKey, status: "BLOCKED" });
    await expect(activateGuildConnection(userA, userB, now)).rejects.toMatchObject({
      code: "GUILD_BLOCKED",
    });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("requires ACTIVE status for every friend projection authority check", async () => {
    mocks.findOne.mockResolvedValue({ pairKey, status: "REMOVED" });
    await expect(requireActiveGuildConnection(userA, userB)).rejects.toMatchObject({
      code: "GUILD_ACCESS_DENIED",
    });
    mocks.findOne.mockResolvedValue({ pairKey, status: "ACTIVE" });
    await expect(requireActiveGuildConnection(userA, userB)).resolves.toMatchObject({
      status: "ACTIVE",
    });
  });

  it("removes sharing in both directions by changing the one pair record", async () => {
    mocks.findOneAndUpdate.mockResolvedValue({ pairKey, status: "REMOVED" });
    await expect(removeGuildMember(userA, userB, now)).resolves.toEqual({
      memberId: userB,
      status: "REMOVED",
    });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { pairKey, status: "ACTIVE" },
      { $set: { status: "REMOVED", removedAt: now, blockedByUserId: null } },
      { new: true },
    );
  });

  it("blocks an active member and cancels pair invitations", async () => {
    mocks.findOne.mockResolvedValue({ _id: "connection", pairKey, status: "ACTIVE" });
    mocks.findOneAndUpdate.mockResolvedValue({ pairKey, status: "BLOCKED" });
    await expect(blockGuildMember(userA, userB, now)).resolves.toEqual({
      memberId: userB,
      status: "BLOCKED",
    });
    expect(mocks.inviteUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING" }),
      { $set: { status: "CANCELLED", cancelledAt: now } },
    );
  });

  it("resolves the opposite user from either side of the pair", async () => {
    mocks.find.mockReturnValue({
      sort: vi
        .fn()
        .mockResolvedValue([
          { userAId: { toString: () => userA }, userBId: { toString: () => userB } },
        ]),
    });
    await expect(getActiveGuildMemberIds(userA)).resolves.toEqual([userB]);
    expect(mocks.find).toHaveBeenCalledWith({
      status: "ACTIVE",
      $or: [{ userAId: userA }, { userBId: userA }],
    });
  });
});
