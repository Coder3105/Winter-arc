import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  getProfile: vi.fn(),
  getConfig: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOneAndDelete: vi.fn(),
  find: vi.fn(),
  sort: vi.fn(),
  init: vi.fn(),
  syncQuest: vi.fn(),
  baseline: vi.fn(),
  latestAssessment: vi.fn(),
  assessments: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/services/profile-service", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/server/services/winter-arc-service", () => ({
  getWinterArcConfig: mocks.getConfig,
}));
vi.mock("@/server/services/daily-quest-service", () => ({
  synchronizeTodayMorningWeight: mocks.syncQuest,
}));
vi.mock("@/server/services/body-composition-service", () => ({
  getBaselineAssessment: mocks.baseline,
  getLatestAssessment: mocks.latestAssessment,
  listBodyCompositionAssessments: mocks.assessments,
}));
vi.mock("@/server/models/weight-record", () => ({
  WeightRecordModel: {
    findOne: mocks.findOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
    findOneAndDelete: mocks.findOneAndDelete,
    find: mocks.find,
    init: mocks.init,
  },
}));

import {
  deleteTodayWeight,
  getTodayWeight,
  getWeightAnalytics,
  getWeightHistory,
  upsertTodayWeight,
} from "@/server/services/weight-service";

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
};

function document(weightKg = 108.6, date = "2026-09-30") {
  return {
    _id: { toString: () => "weight-1" },
    userId: "owner-1",
    winterArcConfigId: "config-1",
    date,
    timezone: "Asia/Kolkata",
    challengeDay: 1,
    challengeWeek: 1,
    weightKg,
    source: "MANUAL" as const,
    recordedAt: new Date("2026-09-30T01:00:00.000Z"),
    createdAt: new Date("2026-09-30T01:00:00.000Z"),
    updatedAt: new Date("2026-09-30T01:00:00.000Z"),
  };
}

function assessment(id = "baseline") {
  return {
    id,
    winterArcConfigId: "config-1",
    source: "InBody120",
    assessmentDate: "2026-08-14T19:11:00.000Z",
    isBaseline: true,
    notes: null,
    measurements: {
      heightCm: 178,
      weightKg: 111.1,
      totalBodyWaterL: 44.3,
      proteinKg: 12,
      mineralsKg: 4.34,
      bodyFatMassKg: 50.4,
      skeletalMuscleMassKg: 34.3,
      percentBodyFat: 45.3,
      bmiReported: 35.1,
      fatFreeMassKg: 60.7,
      basalMetabolicRateKcalReported: 1681,
      waistHipRatio: 1.02,
      visceralFatLevel: 25,
      obesityDegreePercent: 159,
      fatMassIndexKgM2: 15.9,
      targetWeightKgReported: 71.4,
      weightControlKgReported: -39.7,
      fatControlKgReported: -39.7,
      muscleControlKgReported: 0,
    },
    segmentalLean: {} as never,
    segmentalFat: {} as never,
    impedance: null,
    createdAt: "2026-08-14T19:11:00.000Z",
    updatedAt: "2026-08-14T19:11:00.000Z",
  };
}

describe("weight service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.getProfile.mockResolvedValue(profile);
    mocks.getConfig.mockResolvedValue(config);
    mocks.findOne.mockResolvedValue(null);
    mocks.init.mockResolvedValue(undefined);
    mocks.syncQuest.mockResolvedValue({ id: "quest-1" });
    mocks.find.mockReturnValue({ sort: mocks.sort });
    mocks.sort.mockResolvedValue([]);
    mocks.baseline.mockResolvedValue(assessment());
    mocks.latestAssessment.mockResolvedValue(assessment());
    mocks.assessments.mockResolvedValue([assessment()]);
  });

  it("returns explicit setup and protocol availability without writing", async () => {
    mocks.getProfile.mockResolvedValueOnce(null);
    await expect(getTodayWeight("owner-1")).resolves.toEqual({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
    });
    mocks.getConfig.mockResolvedValueOnce({ ...config, status: "DRAFT" });
    await expect(getTodayWeight("owner-1")).resolves.toEqual({
      kind: "UNAVAILABLE",
      reason: "CONFIGURATION_REQUIRED",
    });
    await expect(
      getTodayWeight("owner-1", new Date("2026-09-29T06:00:00Z")),
    ).resolves.toMatchObject({ reason: "PROTOCOL_NOT_STARTED" });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("reads the profile-local date and returns an honest no-record state", async () => {
    const result = await getTodayWeight("owner-1", new Date("2026-09-29T20:00:00.000Z"));
    expect(result).toEqual({
      kind: "AVAILABLE",
      localDate: "2026-09-30",
      weight: null,
    });
    expect(mocks.findOne).toHaveBeenCalledWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: "2026-09-30",
    });
  });

  it("atomically upserts one daily source record and preserves first recordedAt", async () => {
    mocks.findOneAndUpdate.mockResolvedValue(document());
    const now = new Date("2026-09-30T06:00:00.000Z");
    const result = await upsertTodayWeight("owner-1", { weightKg: 108.6 }, now);
    expect(result.weight.weightKg).toBe(108.6);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
      { userId: "owner-1", winterArcConfigId: "config-1", date: "2026-09-30" },
      {
        $set: { weightKg: 108.6 },
        $setOnInsert: expect.objectContaining({
          source: "MANUAL",
          recordedAt: now,
          challengeDay: 1,
          challengeWeek: 1,
        }),
      },
      expect.objectContaining({ upsert: true, returnDocument: "after" }),
    );
    expect(mocks.syncQuest).toHaveBeenCalledExactlyOnceWith("owner-1", now);
  });

  it("concurrent retries use the same canonical filter", async () => {
    mocks.findOneAndUpdate.mockResolvedValue(document());
    await Promise.all([
      upsertTodayWeight(
        "owner-1",
        { weightKg: 108.6 },
        new Date("2026-09-30T06:00:00.000Z"),
      ),
      upsertTodayWeight(
        "owner-1",
        { weightKg: 108.5 },
        new Date("2026-09-30T06:00:00.000Z"),
      ),
    ]);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.findOneAndUpdate.mock.calls.map((call) => call[0])).toEqual([
      { userId: "owner-1", winterArcConfigId: "config-1", date: "2026-09-30" },
      { userId: "owner-1", winterArcConfigId: "config-1", date: "2026-09-30" },
    ]);
  });

  it("deletes only today's owner-scoped weight and synchronizes quest deletion", async () => {
    mocks.findOneAndDelete.mockResolvedValue(document());
    await expect(
      deleteTodayWeight("owner-1", new Date("2026-09-30T06:00:00.000Z")),
    ).resolves.toMatchObject({
      deleted: { id: "weight-1", weightKg: 108.6 },
      quest: { id: "quest-1" },
    });
    expect(mocks.findOneAndDelete).toHaveBeenCalledWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: "2026-09-30",
    });
  });

  it("reconciles the quest even when a delete retry finds no record", async () => {
    mocks.findOneAndDelete.mockResolvedValue(null);
    await expect(
      deleteTodayWeight("owner-1", new Date("2026-09-30T06:00:00.000Z")),
    ).rejects.toMatchObject({
      code: "WEIGHT_NOT_FOUND",
    });
    expect(mocks.syncQuest).toHaveBeenCalledOnce();
  });

  it("owner-scopes sorted bounded history and rejects an excessive range", async () => {
    mocks.sort.mockResolvedValue([document()]);
    const result = await getWeightHistory("owner-1", "2026-09-01", "2026-09-30");
    expect(result).toMatchObject({ kind: "AVAILABLE", weights: [{ weightKg: 108.6 }] });
    expect(mocks.find).toHaveBeenCalledWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: { $gte: "2026-09-01", $lte: "2026-09-30" },
    });
    await expect(
      getWeightHistory("owner-1", "2025-01-01", "2026-09-30"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("builds analytics from baseline plus owner protocol weights without mutating source", async () => {
    mocks.sort.mockResolvedValue([
      document(109, "2026-09-29"),
      document(108.6, "2026-09-30"),
    ]);
    const result = await getWeightAnalytics("owner-1", new Date("2026-09-30T06:00:00Z"));
    expect(result).toMatchObject({
      kind: "AVAILABLE",
      baseline: { weightKg: 111.1 },
      latest: { weightKg: 108.6, source: "WEIGHT_RECORD" },
      change: { direction: "DOWN" },
      goal: { targetWeightKg: 90, status: "AVAILABLE" },
    });
    expect(mocks.find).toHaveBeenCalledWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: { $gte: "2026-09-30", $lte: "2026-12-28" },
    });
    expect(mocks.baseline).toHaveBeenCalledWith("owner-1");
  });
});
