import { describe, expect, it } from "vitest";

import { WorkoutRecordModel } from "@/server/models/workout-record";

describe("WorkoutRecord model contract", () => {
  it("has a non-unique owner/config/date range index", () => {
    const index = WorkoutRecordModel.schema
      .indexes()
      .find(
        ([fields]) =>
          JSON.stringify(fields) ===
          JSON.stringify({ userId: 1, winterArcConfigId: 1, date: 1 }),
      );
    expect(index?.[1]).toMatchObject({ name: "workout_owner_protocol_date" });
    expect(index?.[1].unique).not.toBe(true);
  });

  it("stores sessions separately without Phase 7+ fields", () => {
    expect(WorkoutRecordModel.schema.path("durationMinutes")).toBeDefined();
    expect(WorkoutRecordModel.schema.path("challengeWeek")).toBeDefined();
    expect(WorkoutRecordModel.schema.path("weightKg")).toBeUndefined();
    expect(WorkoutRecordModel.schema.path("caloriesBurned")).toBeUndefined();
    expect(WorkoutRecordModel.schema.path("xp")).toBeUndefined();
  });
});
