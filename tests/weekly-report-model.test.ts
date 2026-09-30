import { describe, expect, it } from "vitest";

import { WeeklyReportModel } from "@/server/models/weekly-report";

describe("Phase 10 weekly report persistence", () => {
  it("enforces the versioned final-report identity", () => {
    const index = WeeklyReportModel.schema
      .indexes()
      .find(([, options]) => options.name === "unique_final_weekly_report");
    expect(index?.[0]).toEqual({
      userId: 1,
      winterArcConfigId: 1,
      challengeWeek: 1,
      reportPolicyVersion: 1,
    });
    expect(index?.[1].unique).toBe(true);
  });

  it("stores immutable FINAL snapshots without private source fields", () => {
    for (const path of [
      "userId",
      "winterArcConfigId",
      "challengeWeek",
      "weekStartDate",
      "weekEndDate",
      "reportPolicyVersion",
      "status",
      "generatedAt",
      "snapshot",
    ])
      expect(WeeklyReportModel.schema.path(path)?.options.immutable).toBe(true);
    expect(WeeklyReportModel.schema.path("rawResponses")).toBeUndefined();
    expect(WeeklyReportModel.schema.path("sessionToken")).toBeUndefined();
    expect(WeeklyReportModel.schema.path("status")?.options.enum).toEqual(["FINAL"]);
  });
});
