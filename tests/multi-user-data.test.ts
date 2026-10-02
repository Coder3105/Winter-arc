import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matches } from "./helpers/memory-query";
import { UserProfileModel } from "@/server/models/user-profile";
import { WinterArcConfigModel } from "@/server/models/winter-arc-config";
import { BodyCompositionAssessmentModel } from "@/server/models/body-composition-assessment";
import { DailyQuestRecordModel } from "@/server/models/daily-quest-record";
import { WorkoutRecordModel } from "@/server/models/workout-record";
import { WeightRecordModel } from "@/server/models/weight-record";
import { ProgressionEventModel } from "@/server/models/progression-event";
import { AchievementUnlockModel } from "@/server/models/achievement-unlock";
import { RewardGrantModel } from "@/server/models/reward-grant";
import { RecoveryProtocolModel } from "@/server/models/recovery-protocol";
import { WeeklyReportModel } from "@/server/models/weekly-report";
import { NotificationRecordModel } from "@/server/models/notification-record";
import { NotificationPreferencesModel } from "@/server/models/notification-preferences";
import { getProfile, saveProfile } from "@/server/services/profile-service";
import { getWinterArcConfig } from "@/server/services/winter-arc-service";
import { listBodyCompositionAssessments } from "@/server/services/body-composition-service";
import { getDailyQuestByDate } from "@/server/services/daily-quest-service";
import { getCalendarMonthHistory } from "@/server/services/history-service";
import { deleteTodayWorkout, getWorkoutsByDate } from "@/server/services/workout-service";
import { getTodayWeight } from "@/server/services/weight-service";
import { getProgressionSummary } from "@/server/services/progression-service";
import { getPhase9StatusSummary } from "@/server/services/achievement-reward-service";
import { getWeeklyReport } from "@/server/services/weekly-report-service";
import {
  getNotifications,
  markNotificationRead,
  saveNotificationPreferences,
} from "@/server/services/notification-service";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/validation/notification-preferences";
vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: vi.fn() }));

type Row = Record<string, unknown>;
const models = {
  profile: UserProfileModel,
  config: WinterArcConfigModel,
  body: BodyCompositionAssessmentModel,
  quest: DailyQuestRecordModel,
  workout: WorkoutRecordModel,
  weight: WeightRecordModel,
  xp: ProgressionEventModel,
  achievement: AchievementUnlockModel,
  reward: RewardGrantModel,
  recovery: RecoveryProtocolModel,
  report: WeeklyReportModel,
  notification: NotificationRecordModel,
  preferences: NotificationPreferencesModel,
};
type Kind = keyof typeof models;
let rows: Record<Kind, Row[]>;
const now = new Date("2026-10-01T12:00:00Z");
const bNotificationId = "00000000000000000000000b";
function chain<T>(result: T) {
  const query = Object.assign(Promise.resolve(result), {
    sort: () => query,
    limit: () => query,
    select: () => query,
  });
  return query;
}

describe("real services over isolated two-user source fixtures", () => {
  beforeEach(() => {
    rows = {
      profile: [],
      config: [],
      body: [],
      quest: [],
      workout: [],
      weight: [],
      xp: [],
      achievement: [],
      reward: [],
      recovery: [],
      report: [],
      notification: [],
      preferences: [],
    };
    for (const [kind, model] of Object.entries(models)) {
      const table = rows[kind as Kind];
      // The matcher applies the actual service filter: omitting userId leaks both fixtures and fails assertions.
      vi.spyOn(model, "find").mockImplementation(
        (filter: unknown) =>
          chain(table.filter((row) => matches(row, filter as Row))) as never,
      );
      vi.spyOn(model, "findOne").mockImplementation(
        (filter: unknown) =>
          chain(table.find((row) => matches(row, filter as Row)) ?? null) as never,
      );
      vi.spyOn(model, "countDocuments").mockImplementation(
        (filter: unknown) =>
          chain(table.filter((row) => matches(row, filter as Row)).length) as never,
      );
      vi.spyOn(model, "findOneAndUpdate").mockImplementation(
        (filter: unknown, update: unknown) => {
          const row = table.find((item) => matches(item, filter as Row));
          if (row) Object.assign(row, (update as { $set: Row }).$set);
          return chain(row ?? null) as never;
        },
      );
      vi.spyOn(model, "findOneAndDelete").mockImplementation((filter: unknown) => {
        const index = table.findIndex((row) => matches(row, filter as Row));
        return chain(index < 0 ? null : table.splice(index, 1)[0]) as never;
      });
    }
    for (const userId of ["a", "b"]) {
      const base = {
        userId,
        winterArcConfigId: "config-" + userId,
        createdAt: now,
        updatedAt: now,
      };
      rows.profile.push({
        ...base,
        _id: "profile-" + userId,
        displayName: userId,
        dateOfBirth: null,
        ageAtBaseline: 30,
        sex: "unspecified",
        heightCm: 170,
        preferredWeightUnit: "kg",
        preferredDistanceUnit: "km",
        timezone: "UTC",
        selectedTitle: null,
      });
      rows.config.push({
        ...base,
        _id: base.winterArcConfigId,
        name: userId,
        startDate: new Date("2026-10-01"),
        endDate: new Date("2026-12-29"),
        durationDays: 90,
        status: "ACTIVE",
        startingWeightKg: 80,
        targetWeightKg: null,
        weeklyWorkoutTarget: 4,
        rules: [],
        notificationPreferences: { enabled: false },
      });
      rows.body.push({
        ...base,
        _id: "body-" + userId,
        source: "MANUAL",
        assessmentDate: now,
        isBaseline: true,
        measurements: { weightKg: userId === "a" ? 80 : 90 },
      });
      rows.quest.push({
        ...base,
        _id: "quest-" + userId,
        date: "2026-10-01",
        timezone: "UTC",
        challengeDay: 1,
        challengeWeek: 1,
        ruleSnapshot: [
          {
            key: "sleep",
            name: "Sleep",
            type: "NUMERIC_MINIMUM",
            target: 7,
            unit: "hours",
            requiredFrequency: 7,
            order: 1,
          },
        ],
        responses: new Map(
          userId === "a"
            ? [["sleep", { kind: "NUMERIC", numericValue: 8, recordedAt: now }]]
            : [],
        ),
        completedAt: null,
      });
      rows.workout.push({
        ...base,
        _id: "workout-" + userId,
        date: "2026-10-01",
        timezone: "UTC",
        challengeDay: 1,
        challengeWeek: 1,
        status: "COMPLETED",
        type: "OTHER",
        title: userId,
        completedAt: now,
      });
      rows.weight.push({
        ...base,
        _id: "weight-" + userId,
        date: "2026-10-01",
        timezone: "UTC",
        challengeDay: 1,
        challengeWeek: 1,
        weightKg: userId === "a" ? 80 : 90,
        source: "MANUAL",
        recordedAt: now,
      });
      rows.xp.push({
        ...base,
        _id: "xp-" + userId,
        sourceType: "DAILY_RULE",
        sourceKey: "daily-rule:2026-10-01:sleep",
        sourceDate: "2026-10-01",
        challengeWeek: 1,
        status: "ACTIVE",
        xp: userId === "a" ? 15 : 30,
        earnedAt: now,
      });
      rows.report.push({
        ...base,
        _id: "report-" + userId,
        challengeWeek: 1,
        reportPolicyVersion: 1,
        snapshot: { marker: userId },
      });
      rows.notification.push({
        ...base,
        _id: userId === "b" ? bNotificationId : "00000000000000000000000a",
        status: "UNREAD",
        title: userId,
        body: "synthetic",
        generatedAt: now,
      });
      rows.preferences.push({
        ...base,
        ...structuredClone(DEFAULT_NOTIFICATION_PREFERENCES),
      });
    }
    const privateBase = { userId: "b", winterArcConfigId: "config-b", status: "ACTIVE" };
    rows.achievement.push({
      ...privateBase,
      achievementKey: "first_perfect_day",
      unlockedAt: now,
    });
    rows.reward.push({ ...privateBase, rewardType: "DAILY_CLEAR" });
    rows.recovery.push({
      ...privateBase,
      type: "DAILY",
      failureCount: 1,
      assignedAt: now,
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it("isolates profile reads and updates, configuration and body measurements", async () => {
    expect(await getProfile("a")).toMatchObject({ id: "profile-a", displayName: "a" });
    expect(await getProfile("b")).toMatchObject({ id: "profile-b", displayName: "b" });
    await saveProfile("a", {
      displayName: "Changed A",
      dateOfBirth: null,
      ageAtBaseline: 30,
      sex: "prefer_not_to_say",
      heightCm: 171,
      timezone: "UTC",
      preferredWeightUnit: "kg",
      preferredDistanceUnit: "km",
    });
    expect((await getProfile("b"))?.displayName).toBe("b");
    expect((await getWinterArcConfig("a"))?.id).toBe("config-a");
    expect((await getWinterArcConfig("b"))?.id).toBe("config-b");
    expect((await listBodyCompositionAssessments("a")).map((item) => item.id)).toEqual([
      "body-a",
    ]);
    expect((await listBodyCompositionAssessments("b")).map((item) => item.id)).toEqual([
      "body-b",
    ]);
  });
  it("isolates same-date quests, calendar, workouts and weights", async () => {
    expect(await getDailyQuestByDate("a", "2026-10-01", now)).toMatchObject({
      id: "quest-a",
      isPerfectDay: true,
    });
    expect(await getDailyQuestByDate("b", "2026-10-01", now)).toMatchObject({
      id: "quest-b",
      isPerfectDay: false,
    });
    const a = await getCalendarMonthHistory("a", "2026-10", now);
    const b = await getCalendarMonthHistory("b", "2026-10", now);
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
    expect(await getWorkoutsByDate("a", "2026-10-01", now)).toMatchObject({
      sessions: [{ id: "workout-a" }],
    });
    expect(await getWorkoutsByDate("b", "2026-10-01", now)).toMatchObject({
      sessions: [{ id: "workout-b" }],
    });
    await expect(deleteTodayWorkout("a", "workout-b", now)).rejects.toMatchObject({
      code: "WORKOUT_NOT_FOUND",
    });
    expect(rows.workout).toHaveLength(2);
    expect(await getTodayWeight("a", now)).toMatchObject({
      weight: { id: "weight-a", weightKg: 80 },
    });
    expect(await getTodayWeight("b", now)).toMatchObject({
      weight: { id: "weight-b", weightKg: 90 },
    });
  });
  it("isolates XP source keys, achievements, rewards and recovery projections", async () => {
    expect(await getProgressionSummary("a", now)).toMatchObject({ totalXp: 15 });
    expect(await getProgressionSummary("b", now)).toMatchObject({ totalXp: 30 });
    expect(await getPhase9StatusSummary("a", "config-b")).toMatchObject({
      achievementCount: 0,
      dailyClearCount: 0,
      activeRecovery: [],
    });
    expect(await getPhase9StatusSummary("b", "config-b")).toMatchObject({
      achievementCount: 1,
      dailyClearCount: 1,
      activeRecovery: [{ failureCount: 1 }],
    });
  });
  it("isolates the same report week and exact notification IDs", async () => {
    expect(await getWeeklyReport("a", 1, now)).toMatchObject({ report: { marker: "a" } });
    expect(await getWeeklyReport("b", 1, now)).toMatchObject({ report: { marker: "b" } });
    expect(await getNotifications("a", { limit: 20 })).toMatchObject({
      unreadCount: 1,
      notifications: [{ title: "a" }],
    });
    await expect(markNotificationRead("a", bNotificationId, now)).rejects.toMatchObject({
      code: "NOTIFICATION_NOT_FOUND",
    });
    expect(rows.notification[1]?.status).toBe("UNREAD");
    await markNotificationRead("b", bNotificationId, now);
    expect(rows.notification[0]?.status).toBe("UNREAD");
    expect(rows.notification[1]?.status).toBe("READ");
  });
  it("disabling A notifications leaves B preferences unchanged", async () => {
    await saveNotificationPreferences("a", {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enabled: false,
    });
    expect(rows.preferences[1]?.enabled).toBe(DEFAULT_NOTIFICATION_PREFERENCES.enabled);
  });
  it("a blank account never inherits existing personal data or history", async () => {
    expect(await getProfile("blank")).toBeNull();
    expect(await getWinterArcConfig("blank")).toBeNull();
    expect(await listBodyCompositionAssessments("blank")).toEqual([]);
    expect(await getTodayWeight("blank", now)).toEqual({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
    });
    expect(await getProgressionSummary("blank", now)).toEqual({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
    });
    expect(await getWeeklyReport("blank", 1, now)).toEqual({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
    });
    expect(await getNotifications("blank", { limit: 20 })).toMatchObject({
      notifications: [],
      unreadCount: 0,
    });
  });
});
