import fs from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/models/user-profile", () => ({
  UserProfileModel: { findOneAndUpdate: mocks.findOneAndUpdate },
}));

import { updateProfileAvatar } from "@/server/services/avatar-service";

describe("V2.5 avatar persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue({});
  });

  it("updates only the session-derived owner profile and only avatarKey", async () => {
    mocks.findOneAndUpdate.mockResolvedValue({ avatarKey: "VOID_COMMANDER" });
    await expect(
      updateProfileAvatar("owner-a", { avatarKey: "VOID_COMMANDER" }),
    ).resolves.toEqual({ avatarKey: "VOID_COMMANDER" });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
      { userId: "owner-a" },
      { $set: { avatarKey: "VOID_COMMANDER" } },
      { returnDocument: "after", runValidators: true },
    );
  });

  it("resets to System default without upserting a profile", async () => {
    mocks.findOneAndUpdate.mockResolvedValue({ avatarKey: null });
    await expect(updateProfileAvatar("owner-a", { avatarKey: null })).resolves.toEqual({
      avatarKey: null,
    });
    expect(mocks.findOneAndUpdate.mock.calls[0]?.[2]).not.toHaveProperty("upsert");
  });

  it("rejects forged ownership and unknown keys before touching persistence", async () => {
    await expect(
      updateProfileAvatar("owner-a", {
        avatarKey: "VOID_COMMANDER",
        userId: "owner-b",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      updateProfileAvatar("owner-a", { avatarKey: "NOT_A_REAL_AVATAR" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("normalizes an unknown legacy database value to the default contract", async () => {
    mocks.findOneAndUpdate.mockResolvedValue({ avatarKey: "LEGACY_UNKNOWN" });
    await expect(
      updateProfileAvatar("owner-a", { avatarKey: "FROST_REAPER" }),
    ).resolves.toEqual({ avatarKey: null });
  });

  it("is cosmetic-only and has no gameplay reconciliation dependency", async () => {
    const source = await fs.readFile(
      path.join(process.cwd(), "src", "server", "services", "avatar-service.ts"),
      "utf8",
    );
    expect(source).toContain("UserProfileModel");
    expect(source).not.toMatch(
      /Progression|DailyQuest|Workout|Achievement|Reward|Recovery|WeeklyReport|ArcScore/,
    );
  });
});
