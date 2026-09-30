import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  find: vi.fn(),
  sort: vi.fn(),
  workoutFind: vi.fn(),
  workoutSort: vi.fn(),
  weightFind: vi.fn(),
  weightSort: vi.fn(),
  getProfile: vi.fn(),
  getConfig: vi.fn(),
  evaluate: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/models/daily-quest-record", () => ({
  DailyQuestRecordModel: { find: mocks.find },
}));
vi.mock("@/server/models/workout-record", () => ({
  WorkoutRecordModel: { find: mocks.workoutFind },
}));
vi.mock("@/server/models/weight-record", () => ({
  WeightRecordModel: { find: mocks.weightFind },
}));
vi.mock("@/server/services/profile-service", () => ({
  getProfile: mocks.getProfile,
}));
vi.mock("@/server/services/winter-arc-service", () => ({
  getWinterArcConfig: mocks.getConfig,
}));
vi.mock("@/server/services/daily-quest-service", () => ({
  evaluateDailyQuestRecord: mocks.evaluate,
}));

import {
  getCalendarMonthHistory,
  getInitialCalendarMonth,
  getStreakHistory,
} from "@/server/services/history-service";

const profile = { timezone: "Asia/Kolkata" };
const config = {
  id: "config-1",
  name: "Winter Arc",
  durationDays: 90,
  startDate: "2026-09-30",
  endDate: "2026-12-28",
  status: "ACTIVE",
  startingWeightKg: 111.1,
  targetWeightKg: null,
  weeklyWorkoutTarget: 4,
  rules: [
    { key: "sleep", name: "Sleep", order: 1, enabled: true },
    { key: "workout", name: "Workout", order: 2, enabled: true },
  ],
};

function evaluated(date: string, perfect = false) {
  return {
    id: `record-${date}`,
    date,
    timezone: "Asia/Kolkata",
    challengeDay: 1,
    challengeWeek: 1,
    durationDays: 90,
    status: perfect ? "COMPLETE" : "MISSED",
    completedRequiredRules: perfect ? 1 : 0,
    totalRequiredRules: 1,
    rawCompletionPercent: perfect ? 100 : 0,
    completionPercent: perfect ? 100 : 0,
    isPerfectDay: perfect,
    rules: [
      {
        key: "sleep",
        name: "Sleep",
        order: 1,
        state: perfect ? "PASS" : "FAIL",
      },
    ],
    completedAt: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
  };
}

describe("history service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getProfile.mockResolvedValue(profile);
    mocks.getConfig.mockResolvedValue(config);
    mocks.connect.mockResolvedValue(undefined);
    mocks.find.mockReturnValue({ sort: mocks.sort });
    mocks.sort.mockResolvedValue([]);
    mocks.workoutFind.mockReturnValue({ sort: mocks.workoutSort });
    mocks.workoutSort.mockResolvedValue([]);
    mocks.weightFind.mockReturnValue({ sort: mocks.weightSort });
    mocks.weightSort.mockResolvedValue([]);
  });

  it("returns explicit unavailable states without querying history", async () => {
    mocks.getProfile.mockResolvedValue(null);
    await expect(getCalendarMonthHistory("owner-1", "2026-10")).resolves.toEqual({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
      month: "2026-10",
    });
    mocks.getProfile.mockResolvedValue(profile);
    mocks.getConfig.mockResolvedValue(null);
    await expect(getStreakHistory("owner-1")).resolves.toEqual({
      kind: "UNAVAILABLE",
      reason: "CONFIGURATION_REQUIRED",
    });
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("uses one owner/config/date range query for a month", async () => {
    const record = { marker: "record" };
    mocks.sort.mockResolvedValue([record]);
    mocks.evaluate.mockReturnValue(evaluated("2026-10-01", true));
    const result = await getCalendarMonthHistory(
      "owner-1",
      "2026-10",
      new Date("2026-10-02T12:00:00Z"),
    );
    expect(mocks.find).toHaveBeenCalledExactlyOnceWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: { $gte: "2026-10-01", $lte: "2026-10-31" },
    });
    expect(mocks.sort).toHaveBeenCalledWith({ date: 1 });
    expect(mocks.workoutFind).toHaveBeenCalledExactlyOnceWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: { $gte: "2026-10-01", $lte: "2026-10-31" },
      status: "COMPLETED",
    });
    expect(mocks.workoutSort).toHaveBeenCalledWith({ date: 1, completedAt: 1 });
    expect(mocks.weightFind).toHaveBeenCalledExactlyOnceWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: { $gte: "2026-10-01", $lte: "2026-10-31" },
    });
    expect(mocks.weightSort).toHaveBeenCalledWith({ date: 1 });
    expect(result).toMatchObject({
      kind: "AVAILABLE",
      timezone: "Asia/Kolkata",
      leadingMondaySlots: 3,
    });
    if (result.kind === "AVAILABLE") {
      expect(result.days[0]).toMatchObject({
        date: "2026-10-01",
        calendarState: "PERFECT",
        recordExists: true,
      });
    }
  });

  it("adds workout markers without affecting calendar perfection", async () => {
    mocks.workoutSort.mockResolvedValue([{ date: "2026-10-01" }, { date: "2026-10-01" }]);
    const result = await getCalendarMonthHistory(
      "owner-1",
      "2026-10",
      new Date("2026-10-02T12:00:00Z"),
    );
    expect(result.kind).toBe("AVAILABLE");
    if (result.kind === "AVAILABLE") {
      expect(result.days[0]).toMatchObject({
        calendarState: "MISSED",
        hasWorkout: true,
        workoutSessionCount: 2,
        isPerfectDay: false,
      });
    }
  });

  it("adds a canonical weight without changing quest or workout state", async () => {
    mocks.weightSort.mockResolvedValue([{ date: "2026-10-01", weightKg: 108.6 }]);
    const result = await getCalendarMonthHistory(
      "owner-1",
      "2026-10",
      new Date("2026-10-02T12:00:00Z"),
    );
    expect(result.kind).toBe("AVAILABLE");
    if (result.kind === "AVAILABLE") {
      expect(result.days[0]).toMatchObject({
        calendarState: "MISSED",
        hasWorkout: false,
        hasWeight: true,
        weightKg: 108.6,
      });
    }
  });

  it("queries the protocol once and derives perfect, missing and rule streaks", async () => {
    mocks.sort.mockResolvedValue([{ day: 1 }, { day: 3 }]);
    mocks.evaluate
      .mockReturnValueOnce(evaluated("2026-09-30", true))
      .mockReturnValueOnce(evaluated("2026-10-02", true));
    const result = await getStreakHistory("owner-1", new Date("2026-10-03T12:00:00Z"));
    expect(mocks.find).toHaveBeenCalledExactlyOnceWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: { $gte: "2026-09-30", $lte: "2026-12-28" },
    });
    expect(result).toMatchObject({
      kind: "AVAILABLE",
      perfectDay: { current: 1, longest: 1 },
      rules: { sleep: { current: 2, longest: 2 } },
      summary: {
        perfectDays: 2,
        recordedDays: 2,
        missedDays: 1,
        elapsedChallengeDays: 4,
      },
    });
    expect(result.kind === "AVAILABLE" && "workout" in result.rules).toBe(false);
  });

  it.each([
    ["2026-09-29T12:00:00Z", "2026-09"],
    ["2026-10-15T12:00:00Z", "2026-10"],
    ["2026-12-29T12:00:00Z", "2026-12"],
  ])("chooses the correct initial month at %s", async (instant, month) => {
    await expect(getInitialCalendarMonth("owner-1", new Date(instant))).resolves.toBe(
      month,
    );
  });
});
