import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  getProfile: vi.fn(),
  getConfig: vi.fn(),
  find: vi.fn(),
  sort: vi.fn(),
  create: vi.fn(),
  findOneAndDelete: vi.fn(),
  reconcileDay: vi.fn(),
  reconcileWeek: vi.fn(),
  reconcilePhase9: vi.fn(),
  reconcileNotifications: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/services/profile-service", () => ({
  getProfile: mocks.getProfile,
}));
vi.mock("@/server/services/winter-arc-service", () => ({
  getWinterArcConfig: mocks.getConfig,
}));
vi.mock("@/server/models/workout-record", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/models/workout-record")>();
  return {
    ...original,
    WorkoutRecordModel: {
      find: mocks.find,
      create: mocks.create,
      findOneAndDelete: mocks.findOneAndDelete,
    },
  };
});
vi.mock("@/server/services/progression-service", () => ({
  reconcileWorkoutDayProgression: mocks.reconcileDay,
  reconcileWorkoutWeekProgression: mocks.reconcileWeek,
}));
vi.mock("@/server/services/achievement-reward-service", () => ({
  reconcilePhase9Systems: mocks.reconcilePhase9,
}));
vi.mock("@/server/services/notification-service", () => ({
  reconcileEventNotifications: mocks.reconcileNotifications,
}));

import { AppError } from "@/server/errors/app-error";
import {
  createTodayWorkout,
  deleteTodayWorkout,
  getCurrentWorkoutDashboard,
  getTodayWorkouts,
  getWorkoutsByDate,
} from "@/server/services/workout-service";

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
  rules: [],
};

function document(id: string, date = "2026-09-30", type = "STRENGTH") {
  return {
    _id: { toString: () => id },
    userId: "owner-1",
    winterArcConfigId: "config-1",
    date,
    timezone: "Asia/Kolkata",
    challengeDay: date === "2026-09-30" ? 1 : 2,
    challengeWeek: 1,
    type,
    title: "Push Day",
    durationMinutes: 65,
    notes: null,
    startedAt: null,
    completedAt: new Date("2026-09-30T06:00:00Z"),
    status: "COMPLETED",
    createdAt: new Date("2026-09-30T06:00:00Z"),
    updatedAt: new Date("2026-09-30T06:00:00Z"),
  };
}

describe("workout service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.getProfile.mockResolvedValue(profile);
    mocks.getConfig.mockResolvedValue(config);
    mocks.find.mockReturnValue({ sort: mocks.sort });
    mocks.sort.mockResolvedValue([]);
  });

  it("returns explicit availability without querying or writing", async () => {
    mocks.getProfile.mockResolvedValueOnce(null);
    await expect(getCurrentWorkoutDashboard("owner-1")).resolves.toEqual({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
    });
    mocks.getConfig.mockResolvedValueOnce(null);
    await expect(getTodayWorkouts("owner-1")).resolves.toEqual({
      kind: "UNAVAILABLE",
      reason: "CONFIGURATION_REQUIRED",
    });
    await expect(
      getCurrentWorkoutDashboard("owner-1", new Date("2026-09-29T06:00:00Z")),
    ).resolves.toEqual({ kind: "UNAVAILABLE", reason: "PROTOCOL_NOT_STARTED" });
    await expect(
      getCurrentWorkoutDashboard("owner-1", new Date("2026-12-29T06:00:00Z")),
    ).resolves.toEqual({ kind: "UNAVAILABLE", reason: "CHALLENGE_COMPLETED" });
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates multiple completed sessions on the same server-resolved day", async () => {
    mocks.create
      .mockResolvedValueOnce(document("workout-1"))
      .mockResolvedValueOnce(document("workout-2", "2026-09-30", "CARDIO"));
    const input = {
      type: "STRENGTH" as const,
      title: "Push Day",
      durationMinutes: 65,
      notes: null,
    };
    await createTodayWorkout("owner-1", input, new Date("2026-09-30T06:00:00Z"));
    await createTodayWorkout(
      "owner-1",
      { ...input, type: "CARDIO" },
      new Date("2026-09-30T08:00:00Z"),
    );
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        winterArcConfigId: "config-1",
        date: "2026-09-30",
        challengeDay: 1,
        challengeWeek: 1,
        status: "COMPLETED",
      }),
    );
  });

  it("deduplicates workout days while retaining all sessions", async () => {
    mocks.sort.mockResolvedValue([
      document("one"),
      document("two", "2026-09-30", "CARDIO"),
      document("three", "2026-10-01"),
    ]);
    const result = await getCurrentWorkoutDashboard(
      "owner-1",
      new Date("2026-10-01T06:00:00Z"),
    );
    expect(mocks.find).toHaveBeenCalledWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: { $gte: "2026-09-30", $lte: "2026-12-28" },
      status: "COMPLETED",
    });
    expect(result).toMatchObject({
      kind: "AVAILABLE",
      week: { completedWorkoutDays: 2, totalWorkoutSessions: 3 },
      todaySessions: [{ id: "three" }],
    });
  });

  it("reads today and historical dates with owner/config scoping", async () => {
    mocks.sort.mockResolvedValue([document("one")]);
    await getTodayWorkouts("owner-1", new Date("2026-09-30T06:00:00Z"));
    expect(mocks.find).toHaveBeenLastCalledWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: "2026-09-30",
      status: "COMPLETED",
    });
    await getWorkoutsByDate("owner-1", "2026-10-01");
    expect(mocks.find).toHaveBeenLastCalledWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: "2026-10-01",
      status: "COMPLETED",
    });
  });

  it("deletes only an exact owner/config/today record", async () => {
    mocks.findOneAndDelete.mockResolvedValueOnce(document("workout-1"));
    await expect(
      deleteTodayWorkout(
        "owner-1",
        "507f1f77bcf86cd799439011",
        new Date("2026-09-30T06:00:00Z"),
      ),
    ).resolves.toMatchObject({ id: "workout-1" });
    expect(mocks.findOneAndDelete).toHaveBeenCalledExactlyOnceWith({
      _id: "507f1f77bcf86cd799439011",
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: "2026-09-30",
    });
  });

  it("rejects missing or another owner's deletion without collateral writes", async () => {
    mocks.findOneAndDelete.mockResolvedValue(null);
    await expect(
      deleteTodayWorkout(
        "owner-1",
        "507f1f77bcf86cd799439011",
        new Date("2026-09-30T06:00:00Z"),
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects creation and dates outside the active challenge", async () => {
    await expect(
      createTodayWorkout(
        "owner-1",
        {
          type: "SPORT",
          title: null,
          durationMinutes: 60,
          notes: null,
        },
        new Date("2026-12-29T06:00:00Z"),
      ),
    ).rejects.toMatchObject({ code: "WORKOUT_NOT_AVAILABLE" });
    await expect(getWorkoutsByDate("owner-1", "2026-09-29")).rejects.toMatchObject({
      code: "WORKOUT_NOT_AVAILABLE",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
