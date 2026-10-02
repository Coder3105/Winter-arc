import mongoose from "mongoose";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  mongoose.deleteModel(/^(WinterArcConfig|DailyQuestRecord)$/);
  vi.resetModules();
});

it("replaces obsolete cached rule schemas when their modules reload in development", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const staleRule = new mongoose.Schema({ order: { type: Number, max: 100 } });
  const staleConfig = mongoose.model(
    "WinterArcConfig",
    new mongoose.Schema({ rules: [staleRule] }),
  );
  const staleQuest = mongoose.model(
    "DailyQuestRecord",
    new mongoose.Schema({ ruleSnapshot: [staleRule] }),
  );
  const { WinterArcConfigModel } = await import("@/server/models/winter-arc-config");
  const { DailyQuestRecordModel } = await import("@/server/models/daily-quest-record");
  expect(WinterArcConfigModel).not.toBe(staleConfig);
  expect(DailyQuestRecordModel).not.toBe(staleQuest);

  const rule = {
    key: "stretching",
    name: "STRETCHING",
    category: "MOVEMENT",
    type: "NUMERIC_MINIMUM",
    enabled: true,
    target: 10,
    unit: "minutes",
    requiredFrequency: 7,
    order: 110,
  };
  const config = new WinterArcConfigModel({
    userId: new mongoose.Types.ObjectId(),
    name: "Winter Arc",
    durationDays: 90,
    startDate: new Date("2026-10-02"),
    endDate: new Date("2026-12-30"),
    status: "ACTIVE",
    rules: [rule],
  });
  await expect(config.validate()).resolves.toBeUndefined();
  await expect(
    new DailyQuestRecordModel({
      userId: config.userId,
      winterArcConfigId: config._id,
      date: "2026-10-02",
      timezone: "UTC",
      challengeDay: 1,
      challengeWeek: 1,
      ruleSnapshot: [rule],
    }).validate(),
  ).resolves.toBeUndefined();
});
