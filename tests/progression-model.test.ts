import { describe, expect, it } from "vitest";

import { ProgressionEventModel } from "@/server/models/progression-event";

describe("ProgressionEvent model contract", () => {
  it("enforces one event per logical owner/config/source identity", () => {
    const index = ProgressionEventModel.schema.indexes().find(
      ([fields]) =>
        JSON.stringify(fields) ===
        JSON.stringify({
          userId: 1,
          winterArcConfigId: 1,
          sourceType: 1,
          sourceKey: 1,
        }),
    );
    expect(index?.[1]).toMatchObject({ unique: true, name: "unique_progression_source" });
  });

  it("stores snapshot XP, version, and revocation audit fields", () => {
    expect(ProgressionEventModel.schema.path("xp")).toBeDefined();
    expect(ProgressionEventModel.schema.path("ruleVersion")).toBeDefined();
    expect(ProgressionEventModel.schema.path("status")).toBeDefined();
    expect(ProgressionEventModel.schema.path("earnedAt")).toBeDefined();
    expect(ProgressionEventModel.schema.path("revokedAt")).toBeDefined();
    expect(ProgressionEventModel.schema.path("totalXp")).toBeUndefined();
  });
});
