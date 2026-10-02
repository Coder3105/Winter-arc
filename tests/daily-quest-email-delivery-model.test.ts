import { describe, expect, it } from "vitest";

import { DailyQuestEmailDeliveryModel } from "@/server/models/daily-quest-email-delivery";

describe("Daily Quest email delivery ledger", () => {
  it("enforces one reminder identity per owner, protocol, and local date", () => {
    expect(DailyQuestEmailDeliveryModel.schema.indexes()).toContainEqual([
      { userId: 1, winterArcConfigId: 1, localDate: 1, type: 1 },
      expect.objectContaining({
        unique: true,
        name: "unique_daily_quest_email_delivery",
      }),
    ]);
  });

  it("stores bounded attempts and meaningful delivery states", () => {
    expect(DailyQuestEmailDeliveryModel.schema.path("attemptCount").options.max).toBe(3);
    expect(DailyQuestEmailDeliveryModel.schema.path("state").options.enum).toEqual([
      "PENDING",
      "SENDING",
      "SENT",
      "FAILED",
    ]);
  });
});
