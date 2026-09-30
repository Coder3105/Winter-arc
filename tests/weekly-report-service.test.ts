import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  getProfile: vi.fn(),
  getConfig: vi.fn(),
  questFind: vi.fn(),
  workoutFind: vi.fn(),
  weightFind: vi.fn(),
  eventFind: vi.fn(),
  achievementFind: vi.fn(),
  rewardFind: vi.fn(),
  recoveryFind: vi.fn(),
  assessmentFind: vi.fn(),
  reportFindOne: vi.fn(),
  reportFindOneAndUpdate: vi.fn(),
  reportInit: vi.fn(),
}));

function model(find: ReturnType<typeof vi.fn>) {
  return { find };
}

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/services/profile-service", () => ({
  getProfile: mocks.getProfile,
}));
vi.mock("@/server/services/winter-arc-service", () => ({
  getWinterArcConfig: mocks.getConfig,
}));
vi.mock("@/server/models/daily-quest-record", () => ({
  DailyQuestRecordModel: model(mocks.questFind),
}));
vi.mock("@/server/models/workout-record", () => ({
  WorkoutRecordModel: model(mocks.workoutFind),
}));
vi.mock("@/server/models/weight-record", () => ({
  WeightRecordModel: model(mocks.weightFind),
}));
vi.mock("@/server/models/progression-event", () => ({
  ProgressionEventModel: model(mocks.eventFind),
}));
vi.mock("@/server/models/achievement-unlock", () => ({
  AchievementUnlockModel: model(mocks.achievementFind),
}));
vi.mock("@/server/models/reward-grant", () => ({
  RewardGrantModel: model(mocks.rewardFind),
}));
vi.mock("@/server/models/recovery-protocol", () => ({
  RecoveryProtocolModel: model(mocks.recoveryFind),
}));
vi.mock("@/server/models/body-composition-assessment", () => ({
  BodyCompositionAssessmentModel: model(mocks.assessmentFind),
}));
vi.mock("@/server/models/weekly-report", () => ({
  WeeklyReportModel: {
    findOne: mocks.reportFindOne,
    findOneAndUpdate: mocks.reportFindOneAndUpdate,
    init: mocks.reportInit,
  },
}));

import { AppError } from "@/server/errors/app-error";
import {
  getWeeklyReport,
  getWeeklyReportList,
} from "@/server/services/weekly-report-service";

const profile = { timezone: "Asia/Kolkata" };
const config = {
  id: "config-1",
  name: "Winter Arc",
  durationDays: 90,
  startDate: "2026-09-30",
  endDate: "2026-12-28",
  status: "ACTIVE",
  startingWeightKg: 111.1,
  targetWeightKg: 90,
  weeklyWorkoutTarget: 4,
  rules: [],
  notificationPreferences: { enabled: false },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

describe("weekly report service", () => {
  let stored: { snapshot: unknown } | null;

  beforeEach(() => {
    vi.resetAllMocks();
    stored = null;
    mocks.connect.mockResolvedValue(undefined);
    mocks.getProfile.mockResolvedValue(profile);
    mocks.getConfig.mockResolvedValue(config);
    for (const find of [
      mocks.questFind,
      mocks.workoutFind,
      mocks.weightFind,
      mocks.eventFind,
      mocks.achievementFind,
      mocks.rewardFind,
      mocks.recoveryFind,
      mocks.assessmentFind,
    ])
      find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) });
    mocks.reportInit.mockResolvedValue(undefined);
    mocks.reportFindOne.mockImplementation(() => Promise.resolve(stored));
    mocks.reportFindOneAndUpdate.mockImplementation((_filter, update) => {
      stored ??= { snapshot: update.$setOnInsert.snapshot };
      return Promise.resolve(stored);
    });
  });

  it("returns explicit availability before touching report persistence", async () => {
    mocks.getProfile.mockResolvedValueOnce(null);
    await expect(getWeeklyReportList("owner-1")).resolves.toEqual({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
    });
    mocks.getConfig.mockResolvedValueOnce(null);
    await expect(getWeeklyReportList("owner-1")).resolves.toEqual({
      kind: "UNAVAILABLE",
      reason: "CONFIGURATION_REQUIRED",
    });
    await expect(
      getWeeklyReportList("owner-1", new Date("2026-09-28T12:00:00Z")),
    ).resolves.toEqual({ kind: "UNAVAILABLE", reason: "PROTOCOL_NOT_STARTED" });
    expect(mocks.reportFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("derives a PREVIEW without persisting it", async () => {
    const result = await getWeeklyReport("owner-1", 1, new Date("2026-09-30T12:00:00Z"));
    expect(result).toMatchObject({
      kind: "AVAILABLE",
      report: {
        status: "PREVIEW",
        period: { challengeWeek: 1, availableDays: 7 },
        dailyQuest: { elapsedDays: 1, missedDays: 1 },
        arcScore: { value: 0, isProvisional: true },
      },
    });
    expect(mocks.reportFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("persists a FINAL snapshot once and returns the stable stored report", async () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const first = await getWeeklyReport("owner-1", 1, now);
    const second = await getWeeklyReport("owner-1", 1, new Date("2026-10-08T12:00:00Z"));
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      kind: "AVAILABLE",
      report: {
        status: "FINAL",
        dailyQuest: { elapsedDays: 7, missedDays: 7 },
        arcScore: { value: 0, isProvisional: false },
        systemEvaluation: { label: "INCOMPLETE" },
      },
    });
    expect(mocks.reportFindOneAndUpdate).toHaveBeenCalledOnce();
    expect(mocks.reportFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        winterArcConfigId: "config-1",
        challengeWeek: 1,
        reportPolicyVersion: 1,
      }),
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ status: "FINAL" }),
      }),
      expect.objectContaining({ upsert: true, returnDocument: "after" }),
    );
  });

  it("converges concurrent finalization on the same versioned snapshot", async () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const [left, right] = await Promise.all([
      getWeeklyReport("owner-1", 1, now),
      getWeeklyReport("owner-1", 1, now),
    ]);
    expect(left).toEqual(right);
    expect(mocks.reportFindOneAndUpdate).toHaveBeenCalled();
    for (const [filter] of mocks.reportFindOneAndUpdate.mock.calls)
      expect(filter).toEqual({
        userId: "owner-1",
        winterArcConfigId: "config-1",
        challengeWeek: 1,
        reportPolicyVersion: 1,
      });
  });

  it("rejects invalid, future, and post-duration week numbers", async () => {
    await expect(getWeeklyReport("owner-1", 0)).rejects.toBeInstanceOf(AppError);
    await expect(
      getWeeklyReport("owner-1", 2, new Date("2026-09-30T12:00:00Z")),
    ).rejects.toMatchObject({ code: "REPORT_NOT_AVAILABLE" });
    await expect(
      getWeeklyReport("owner-1", 14, new Date("2026-12-29T12:00:00Z")),
    ).rejects.toMatchObject({ code: "REPORT_NOT_AVAILABLE" });
  });
});
