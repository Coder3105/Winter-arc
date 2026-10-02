import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: vi.fn() }));

import { OnboardingDraftModel } from "@/server/models/onboarding-draft";
import { OwnerModel } from "@/server/models/owner";
import { UserProfileModel } from "@/server/models/user-profile";
import { WinterArcConfigModel } from "@/server/models/winter-arc-config";
import { activateOnboarding } from "@/server/services/onboarding-service";

const input = {
  displayName: "New Hunter",
  heightCm: null,
  currentWeightKg: null,
  targetWeightKg: null,
  ageAtBaseline: null,
  sex: null,
  timezone: "UTC",
  startDate: "2026-10-05",
  weeklyWorkoutTarget: 4,
  rules: [
    { key: "journaling" as const, target: null },
    { key: "reading" as const, target: 20 },
  ],
};

function config(id = "config-a") {
  return { _id: { toString: () => id } };
}

describe("onboarding activation service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(WinterArcConfigModel, "init").mockResolvedValue({} as never);
    vi.spyOn(UserProfileModel, "findOneAndUpdate").mockResolvedValue({} as never);
    vi.spyOn(OwnerModel, "updateOne").mockResolvedValue({} as never);
    vi.spyOn(OnboardingDraftModel, "deleteOne").mockResolvedValue({} as never);
  });

  it("does not rewrite an already active existing owner", async () => {
    vi.spyOn(WinterArcConfigModel, "findOne").mockResolvedValue(
      config("legacy") as never,
    );
    const update = vi.spyOn(WinterArcConfigModel, "findOneAndUpdate");
    expect(await activateOnboarding("original-owner", input)).toEqual({
      configId: "legacy",
      alreadyActive: true,
    });
    expect(UserProfileModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(OwnerModel.updateOne).not.toHaveBeenCalled();
  });

  it("creates one active 90-day configuration with only selected catalogue rules", async () => {
    vi.spyOn(WinterArcConfigModel, "findOne").mockResolvedValue(null);
    const create = vi
      .spyOn(WinterArcConfigModel, "findOneAndUpdate")
      .mockResolvedValue(config() as never);
    expect(await activateOnboarding("owner-a", input)).toEqual({
      configId: "config-a",
      alreadyActive: false,
    });
    expect(UserProfileModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: "owner-a" },
      expect.objectContaining({
        $set: expect.objectContaining({
          displayName: "New Hunter",
          heightCm: null,
          ageAtBaseline: null,
          sex: null,
          timezone: "UTC",
        }),
      }),
      expect.any(Object),
    );
    expect(create).toHaveBeenCalledWith(
      { userId: "owner-a", status: "ACTIVE" },
      {
        $setOnInsert: expect.objectContaining({
          durationDays: 90,
          startingWeightKg: null,
          targetWeightKg: null,
          weeklyWorkoutTarget: 4,
          rules: [
            expect.objectContaining({ key: "reading", target: 20 }),
            expect.objectContaining({ key: "journaling", target: null }),
          ],
        }),
      },
      expect.objectContaining({ upsert: true }),
    );
    expect(OwnerModel.updateOne).toHaveBeenCalledWith(
      { _id: "owner-a" },
      { $set: { displayName: "New Hunter" } },
    );
    expect(OnboardingDraftModel.deleteOne).toHaveBeenCalledWith({ userId: "owner-a" });
  });

  it("accepts the server-defined Stretching order during activation", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    vi.spyOn(WinterArcConfigModel, "findOne").mockResolvedValue(null);
    const create = vi
      .spyOn(WinterArcConfigModel, "findOneAndUpdate")
      .mockResolvedValue(config() as never);

    await expect(
      activateOnboarding(userId, {
        ...input,
        rules: [{ key: "stretching", target: 10 }],
      }),
    ).resolves.toEqual({ configId: "config-a", alreadyActive: false });

    const update = create.mock.calls[0]![1] as { $setOnInsert: object };
    await expect(
      new WinterArcConfigModel(update.$setOnInsert).validate(),
    ).resolves.toBeUndefined();
  });

  it("converges a duplicate-key activation race on the winning config", async () => {
    vi.spyOn(WinterArcConfigModel, "findOne")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(config("winner") as never);
    vi.spyOn(WinterArcConfigModel, "findOneAndUpdate").mockRejectedValue({ code: 11000 });
    expect(await activateOnboarding("owner-a", input)).toEqual({
      configId: "winner",
      alreadyActive: false,
    });
  });

  it("preserves the failing activation stage and original cause for safe diagnostics", async () => {
    vi.spyOn(WinterArcConfigModel, "findOne").mockResolvedValue(null);
    const cause = new mongoose.Error.ValidationError();
    vi.spyOn(UserProfileModel, "findOneAndUpdate").mockRejectedValue(cause);
    await expect(activateOnboarding("owner-a", input)).rejects.toMatchObject({
      stage: "profile_write",
      cause,
    });
  });

  it("preserves a duplicate-key error when no concurrent activation won", async () => {
    vi.spyOn(WinterArcConfigModel, "findOne").mockResolvedValue(null);
    const cause = { code: 11000 };
    vi.spyOn(WinterArcConfigModel, "findOneAndUpdate").mockRejectedValue(cause);
    await expect(activateOnboarding("owner-a", input)).rejects.toMatchObject({
      stage: "config_write",
      cause,
    });
  });

  it("declares database uniqueness for active protocols and onboarding drafts", () => {
    expect(WinterArcConfigModel.schema.indexes()).toContainEqual([
      { userId: 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { status: "ACTIVE" },
        name: "unique_active_winter_arc_per_user",
      }),
    ]);
    expect(OnboardingDraftModel.schema.indexes()).toContainEqual([
      { userId: 1 },
      expect.objectContaining({
        unique: true,
        name: "unique_onboarding_draft_per_user",
      }),
    ]);
  });
});
