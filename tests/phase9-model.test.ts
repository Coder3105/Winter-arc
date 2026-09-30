import { describe, expect, it } from "vitest";

import { AchievementUnlockModel } from "@/server/models/achievement-unlock";
import { RecoveryProtocolModel } from "@/server/models/recovery-protocol";
import { RewardGrantModel } from "@/server/models/reward-grant";

describe("Phase 9 persistence contracts", () => {
  it.each([
    [AchievementUnlockModel, "unique_achievement_unlock"],
    [RewardGrantModel, "unique_reward_grant"],
    [RecoveryProtocolModel, "unique_recovery_source"],
  ] as const)("enforces deterministic logical identity", (model, name) => {
    expect(
      model.schema
        .indexes()
        .some(([, options]) => options.unique === true && options.name === name),
    ).toBe(true);
  });

  it("keeps recovery constructive and contains no XP field", () => {
    expect(RecoveryProtocolModel.schema.path("requirementType")).toBeDefined();
    expect(RecoveryProtocolModel.schema.path("failureCount")).toBeDefined();
    expect(RecoveryProtocolModel.schema.path("xp")).toBeUndefined();
    expect(RecoveryProtocolModel.schema.path("penalty")).toBeUndefined();
  });
});
