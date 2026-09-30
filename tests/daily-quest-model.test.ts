import { describe, expect, it } from "vitest";

import { DailyQuestRecordModel } from "@/server/models/daily-quest-record";

describe("DailyQuestRecord model contract", () => {
  it("has a unique owner/config/local-date constraint", () => {
    const index = DailyQuestRecordModel.schema
      .indexes()
      .find(
        ([fields]) =>
          JSON.stringify(fields) ===
          JSON.stringify({ userId: 1, winterArcConfigId: 1, date: 1 }),
      );
    expect(index?.[1]).toMatchObject({
      unique: true,
      name: "unique_daily_quest_per_protocol",
    });
  });

  it("stores responses separately from immutable rule definitions", () => {
    expect(DailyQuestRecordModel.schema.path("ruleSnapshot")).toBeDefined();
    expect(DailyQuestRecordModel.schema.path("responses")).toBeDefined();
    expect(DailyQuestRecordModel.schema.path("date")).toBeDefined();
    expect(DailyQuestRecordModel.schema.path("weightKg")).toBeUndefined();
    expect(DailyQuestRecordModel.schema.path("workout")).toBeUndefined();
    expect(DailyQuestRecordModel.schema.path("xp")).toBeUndefined();
  });
});
