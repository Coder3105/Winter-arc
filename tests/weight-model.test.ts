import { describe, expect, it } from "vitest";

import { WeightRecordModel } from "@/server/models/weight-record";

describe("WeightRecord model contract", () => {
  it("has one unique canonical weight per owner/config/date", () => {
    const index = WeightRecordModel.schema
      .indexes()
      .find(
        ([fields]) =>
          JSON.stringify(fields) ===
          JSON.stringify({ userId: 1, winterArcConfigId: 1, date: 1 }),
      );
    expect(index?.[1]).toMatchObject({
      unique: true,
      name: "unique_weight_per_protocol_day",
    });
  });

  it("stores source facts but no derived analytics", () => {
    expect(WeightRecordModel.schema.path("weightKg")).toBeDefined();
    expect(WeightRecordModel.schema.path("recordedAt")).toBeDefined();
    expect(WeightRecordModel.schema.path("source")).toBeDefined();
    expect(WeightRecordModel.schema.path("rollingAverageKg")).toBeUndefined();
    expect(WeightRecordModel.schema.path("trend")).toBeUndefined();
    expect(WeightRecordModel.schema.path("bodyFatPercent")).toBeUndefined();
  });
});
