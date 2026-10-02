import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DAILY_RULE_CATALOGUE } from "@/features/winter-arc/rules";
import { WinterArcConfigModel } from "@/server/models/winter-arc-config";
import { DailyQuestRecordModel } from "@/server/models/daily-quest-record";

const rules = DAILY_RULE_CATALOGUE.map((rule) => ({
  key: rule.key,
  name: rule.name,
  category: rule.category,
  type: rule.type,
  enabled: true,
  target: rule.target?.placeholder ?? null,
  unit: rule.unit,
  requiredFrequency: 7,
  order: rule.order,
}));

describe("catalogue rule persistence", () => {
  afterEach(() => vi.restoreAllMocks());

  it("validates the actual configuration upsert including every catalogue rule before database dispatch", async () => {
    // Intercept only the Mongo collection boundary: Mongoose casts/defaults/validators still run.
    const write = vi
      .spyOn(WinterArcConfigModel.collection, "findOneAndUpdate")
      .mockResolvedValue(null as never);
    const userId = new mongoose.Types.ObjectId();
    await expect(
      WinterArcConfigModel.findOneAndUpdate(
        { userId, status: "ACTIVE" },
        {
          $setOnInsert: {
            userId,
            name: "Winter Arc",
            durationDays: 90,
            startDate: new Date("2026-10-02T00:00:00Z"),
            endDate: new Date("2026-12-30T00:00:00Z"),
            status: "ACTIVE",
            startingWeightKg: null,
            targetWeightKg: null,
            weeklyWorkoutTarget: 4,
            rules,
            notificationPreferences: { enabled: false },
          },
        },
        {
          upsert: true,
          returnDocument: "after",
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      ),
    ).resolves.toBeNull();
    expect(write).toHaveBeenCalledOnce();
  });

  it("accepts all selected rules in the subsequent daily-quest snapshot", async () => {
    await expect(
      new DailyQuestRecordModel({
        userId: new mongoose.Types.ObjectId(),
        winterArcConfigId: new mongoose.Types.ObjectId(),
        date: "2026-10-02",
        timezone: "UTC",
        challengeDay: 1,
        challengeWeek: 1,
        ruleSnapshot: rules,
      }).validate(),
    ).resolves.toBeUndefined();
  });
});
