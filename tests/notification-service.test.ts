import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/validation/notification-preferences";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  getProfile: vi.fn(),
  getConfig: vi.fn(),
  preferenceInit: vi.fn(),
  preferenceFindOne: vi.fn(),
  preferenceUpsert: vi.fn(),
  notificationInit: vi.fn(),
  notificationFind: vi.fn(),
  notificationSelect: vi.fn(),
  notificationSort: vi.fn(),
  notificationLimit: vi.fn(),
  notificationFindOne: vi.fn(),
  notificationUpsert: vi.fn(),
  notificationUpdateOne: vi.fn(),
  notificationUpdateMany: vi.fn(),
  notificationCount: vi.fn(),
  questFindOne: vi.fn(),
  weightExists: vi.fn(),
  workoutFind: vi.fn(),
  recoveryFind: vi.fn(),
  reportFind: vi.fn(),
  achievementFind: vi.fn(),
  rewardFind: vi.fn(),
  progressionFind: vi.fn(),
  transportSend: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/services/profile-service", () => ({
  getProfile: mocks.getProfile,
}));
vi.mock("@/server/services/winter-arc-service", () => ({
  getWinterArcConfig: mocks.getConfig,
}));
vi.mock("@/server/models/notification-preferences", () => ({
  NotificationPreferencesModel: {
    init: mocks.preferenceInit,
    findOne: mocks.preferenceFindOne,
    findOneAndUpdate: mocks.preferenceUpsert,
  },
}));
vi.mock("@/server/models/notification-record", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/models/notification-record")>();
  return {
    ...original,
    NotificationRecordModel: {
      init: mocks.notificationInit,
      find: mocks.notificationFind,
      findOne: mocks.notificationFindOne,
      findOneAndUpdate: mocks.notificationUpsert,
      updateOne: mocks.notificationUpdateOne,
      updateMany: mocks.notificationUpdateMany,
      countDocuments: mocks.notificationCount,
    },
  };
});
vi.mock("@/server/models/daily-quest-record", () => ({
  DailyQuestRecordModel: { findOne: mocks.questFindOne },
}));
vi.mock("@/server/notifications/notification-transport", () => ({
  WebPushNotificationTransport: class {
    send = mocks.transportSend;
  },
}));
vi.mock("@/server/models/weight-record", () => ({
  WeightRecordModel: { exists: mocks.weightExists },
}));
vi.mock("@/server/models/workout-record", () => ({
  WorkoutRecordModel: { find: mocks.workoutFind },
}));
vi.mock("@/server/models/recovery-protocol", () => ({
  RecoveryProtocolModel: { find: mocks.recoveryFind },
}));
vi.mock("@/server/models/weekly-report", () => ({
  WeeklyReportModel: { find: mocks.reportFind },
}));
vi.mock("@/server/models/achievement-unlock", () => ({
  AchievementUnlockModel: { find: mocks.achievementFind },
}));
vi.mock("@/server/models/reward-grant", () => ({
  RewardGrantModel: { find: mocks.rewardFind },
}));
vi.mock("@/server/models/progression-event", () => ({
  ProgressionEventModel: { find: mocks.progressionFind },
}));

import {
  evaluateTimeBasedReminders,
  getNotificationPreferences,
  getNotifications,
  markAllNotificationsRead,
  saveNotificationPreferences,
} from "@/server/services/notification-service";

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
  rules: [
    {
      key: "sleep",
      name: "Sleep",
      category: "recovery",
      enabled: true,
      type: "NUMERIC_MINIMUM",
      target: 7,
      unit: "hours",
      requiredFrequency: 7,
      order: 1,
    },
  ],
};

function preferenceDocument(enabled = true) {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    enabled,
    hydration: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.hydration,
      times: [...DEFAULT_NOTIFICATION_PREFERENCES.hydration.times],
    },
    timezoneSnapshot: "Asia/Kolkata",
  };
}

describe("notification service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.getProfile.mockResolvedValue(profile);
    mocks.getConfig.mockResolvedValue(config);
    mocks.preferenceInit.mockResolvedValue(undefined);
    mocks.notificationInit.mockResolvedValue(undefined);
    mocks.preferenceFindOne.mockResolvedValue(preferenceDocument());
    mocks.preferenceUpsert.mockImplementation((_filter, update) =>
      Promise.resolve({ ...preferenceDocument(), ...update.$set }),
    );
    mocks.notificationFind.mockImplementation((filter) =>
      "policyVersion" in filter
        ? { select: mocks.notificationSelect }
        : { sort: mocks.notificationSort },
    );
    mocks.notificationSelect.mockResolvedValue([]);
    mocks.notificationSort.mockReturnValue({ limit: mocks.notificationLimit });
    mocks.notificationLimit.mockResolvedValue([]);
    mocks.notificationFindOne.mockResolvedValue(null);
    mocks.notificationUpsert.mockResolvedValue({ _id: "notification-1" });
    mocks.notificationUpdateOne.mockResolvedValue({ upsertedCount: 1, modifiedCount: 1 });
    mocks.transportSend.mockResolvedValue({
      delivery: "PUSH_UNAVAILABLE",
      attemptedCount: 0,
      successCount: 0,
      failureCount: 0,
      invalidatedCount: 0,
      attemptedAt: null,
      deliveredAt: null,
    });
    mocks.notificationUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    mocks.notificationCount.mockResolvedValue(0);
    mocks.questFindOne.mockResolvedValue(null);
    mocks.weightExists.mockResolvedValue({ _id: "weight-1" });
    mocks.workoutFind.mockResolvedValue([]);
    mocks.recoveryFind.mockResolvedValue([]);
    mocks.reportFind.mockResolvedValue([]);
    mocks.achievementFind.mockResolvedValue([]);
    mocks.rewardFind.mockResolvedValue([]);
    mocks.progressionFind.mockResolvedValue([]);
  });

  it("returns non-persisted opt-in defaults and requires a profile timezone", async () => {
    mocks.preferenceFindOne.mockResolvedValue(null);
    await expect(getNotificationPreferences("owner-1")).resolves.toMatchObject({
      kind: "AVAILABLE",
      preferences: {
        enabled: false,
        timezone: "Asia/Kolkata",
        isPersisted: false,
      },
    });
    expect(mocks.preferenceFindOne).toHaveBeenCalledExactlyOnceWith({
      userId: "owner-1",
    });

    mocks.getProfile.mockResolvedValueOnce(null);
    await expect(getNotificationPreferences("owner-1")).resolves.toEqual({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
    });
  });

  it("stores validated preferences with a server-controlled timezone snapshot", async () => {
    const input = { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true };
    await saveNotificationPreferences("owner-1", input);
    expect(mocks.preferenceUpsert).toHaveBeenCalledWith(
      { userId: "owner-1" },
      {
        $set: { ...input, timezoneSnapshot: "Asia/Kolkata" },
        $setOnInsert: { userId: "owner-1" },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
  });

  it("does not load source records or generate anything while globally disabled", async () => {
    mocks.preferenceFindOne.mockResolvedValue(preferenceDocument(false));
    await expect(
      evaluateTimeBasedReminders("owner-1", new Date("2026-10-05T14:30:00.000Z")),
    ).resolves.toEqual({
      kind: "AVAILABLE",
      generated: 0,
      reason: "REMINDERS_DISABLED",
    });
    expect(mocks.questFindOne).not.toHaveBeenCalled();
    expect(mocks.notificationUpsert).not.toHaveBeenCalled();
  });

  it("enforces the defensive daily ceiling after owner-scoped source reads", async () => {
    mocks.notificationCount.mockResolvedValue(10);
    const result = await evaluateTimeBasedReminders(
      "owner-1",
      new Date("2026-10-05T14:30:00.000Z"),
    );
    expect(result).toMatchObject({
      kind: "AVAILABLE",
      generated: 0,
      localDate: "2026-10-05",
    });
    expect(mocks.questFindOne).toHaveBeenCalledWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: "2026-10-05",
    });
    expect(mocks.notificationCount).toHaveBeenCalledWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      sourceType: "TIME_BASED",
      sourceDate: "2026-10-05",
    });
    expect(mocks.notificationUpsert).not.toHaveBeenCalled();
  });

  it("recovers an atomic duplicate-key race by reading the winning record", async () => {
    mocks.preferenceFindOne.mockResolvedValue({
      ...preferenceDocument(),
      morningWeight: { enabled: false, time: "09:00" },
      hydration: { enabled: false, times: [] },
      steps: { enabled: false, time: "19:00" },
      workout: { enabled: false },
      recovery: { enabled: false },
      weeklyReport: { enabled: false, time: "09:00" },
    });
    mocks.notificationUpdateOne.mockRejectedValueOnce({ code: 11000 });
    mocks.notificationFindOne.mockResolvedValue({ _id: "winner" });
    const result = await evaluateTimeBasedReminders(
      "owner-1",
      new Date("2026-10-05T14:30:00.000Z"),
    );
    expect(result).toMatchObject({ kind: "AVAILABLE", generated: 1 });
    expect(mocks.notificationUpdateOne).toHaveBeenCalledTimes(1);
    expect(mocks.notificationFindOne).toHaveBeenCalledWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      dedupeKey: "daily-quest:2026-10-05:20:00",
      policyVersion: 1,
    });
    expect(mocks.transportSend).not.toHaveBeenCalled();
  });

  it("creates the logical record before one push attempt and suppresses known dedupe keys", async () => {
    mocks.preferenceFindOne.mockResolvedValue({
      ...preferenceDocument(),
      morningWeight: { enabled: false, time: "09:00" },
      hydration: { enabled: false, times: [] },
      steps: { enabled: false, time: "19:00" },
      workout: { enabled: false },
      recovery: { enabled: false },
      weeklyReport: { enabled: false, time: "09:00" },
    });
    await evaluateTimeBasedReminders("owner-1", new Date("2026-10-05T14:30:00.000Z"));
    expect(mocks.notificationUpdateOne).toHaveBeenCalledTimes(2);
    expect(mocks.notificationUpdateOne.mock.calls[0]?.[1]).toMatchObject({
      $setOnInsert: { delivery: "PUSH_PENDING" },
    });
    expect(mocks.transportSend).toHaveBeenCalledTimes(1);

    vi.resetAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.getProfile.mockResolvedValue(profile);
    mocks.getConfig.mockResolvedValue(config);
    mocks.preferenceInit.mockResolvedValue(undefined);
    mocks.notificationInit.mockResolvedValue(undefined);
    mocks.preferenceFindOne.mockResolvedValue({
      ...preferenceDocument(),
      morningWeight: { enabled: false, time: "09:00" },
      hydration: { enabled: false, times: [] },
      steps: { enabled: false, time: "19:00" },
      workout: { enabled: false },
      recovery: { enabled: false },
      weeklyReport: { enabled: false, time: "09:00" },
    });
    mocks.notificationFind.mockReturnValue({ select: mocks.notificationSelect });
    mocks.notificationSelect.mockResolvedValue([
      { dedupeKey: "daily-quest:2026-10-05:20:00" },
    ]);
    mocks.notificationCount.mockResolvedValue(1);
    mocks.questFindOne.mockResolvedValue(null);
    mocks.weightExists.mockResolvedValue({ _id: "weight-1" });
    mocks.workoutFind.mockResolvedValue([]);
    mocks.recoveryFind.mockResolvedValue([]);
    mocks.reportFind.mockResolvedValue([]);
    await evaluateTimeBasedReminders("owner-1", new Date("2026-10-05T14:30:00.000Z"));
    expect(mocks.transportSend).not.toHaveBeenCalled();
  });

  it("owner-scopes inbox pagination and unread aggregation", async () => {
    mocks.notificationCount.mockResolvedValue(3);
    const result = await getNotifications("owner-1", { limit: 20 });
    expect(result).toEqual({ notifications: [], unreadCount: 3, nextCursor: null });
    expect(mocks.notificationFind).toHaveBeenCalledWith({
      userId: "owner-1",
      status: { $ne: "DISMISSED" },
    });
    expect(mocks.notificationCount).toHaveBeenCalledWith({
      userId: "owner-1",
      status: "UNREAD",
    });
  });

  it("marks only the authenticated owner's unread records as read", async () => {
    mocks.notificationUpdateMany.mockResolvedValue({ modifiedCount: 2 });
    await expect(markAllNotificationsRead("owner-1")).resolves.toEqual({
      updatedCount: 2,
    });
    expect(mocks.notificationUpdateMany).toHaveBeenCalledWith(
      { userId: "owner-1", status: "UNREAD" },
      { $set: { status: "READ", readAt: expect.any(Date) } },
    );
  });
});
