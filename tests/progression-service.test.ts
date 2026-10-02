import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  events: new Map<string, Record<string, unknown>>(),
  connect: vi.fn(),
  init: vi.fn(),
  findOneAndUpdate: vi.fn(),
  eventFind: vi.fn(),
  questFindOne: vi.fn(),
  workoutExists: vi.fn(),
  workoutFind: vi.fn(),
  getProfile: vi.fn(),
  getConfig: vi.fn(),
  getPhase9Status: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/services/profile-service", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/server/services/winter-arc-service", () => ({
  getWinterArcConfig: mocks.getConfig,
}));
vi.mock("@/server/services/achievement-reward-service", () => ({
  getPhase9StatusSummary: mocks.getPhase9Status,
}));
vi.mock("@/server/models/progression-event", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/models/progression-event")>();
  return {
    ...original,
    ProgressionEventModel: {
      init: mocks.init,
      findOneAndUpdate: mocks.findOneAndUpdate,
      find: mocks.eventFind,
    },
  };
});
vi.mock("@/server/models/daily-quest-record", () => ({
  DailyQuestRecordModel: { findOne: mocks.questFindOne },
}));
vi.mock("@/server/models/workout-record", () => ({
  WorkoutRecordModel: { exists: mocks.workoutExists, find: mocks.workoutFind },
}));

import { evaluateDailyQuest } from "@/server/daily-quest/evaluation";
import {
  getProgressionSummary,
  reconcileDailyQuestProgression,
  reconcileWorkoutDayProgression,
  reconcileWorkoutWeekProgression,
} from "@/server/services/progression-service";

const config = {
  id: "507f1f77bcf86cd799439012",
  name: "Winter Arc",
  durationDays: 90,
  startDate: "2026-09-30",
  endDate: "2026-12-28",
  status: "ACTIVE" as const,
  startingWeightKg: 111.1,
  targetWeightKg: 90,
  weeklyWorkoutTarget: 4,
  rules: [],
  notificationPreferences: { enabled: false },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function quest(
  key: string,
  value: boolean | number | null,
  target: number | null = null,
) {
  const numeric = typeof value === "number";
  return evaluateDailyQuest({
    id: "507f1f77bcf86cd799439013",
    date: "2026-09-30",
    timezone: "UTC",
    challengeDay: 1,
    challengeWeek: 1,
    durationDays: 90,
    rules: [
      {
        key,
        name: key,
        type: numeric || target !== null ? "NUMERIC_MINIMUM" : "BOOLEAN",
        target,
        unit: null,
        requiredFrequency: 7,
        order: 1,
      },
    ],
    responses:
      value === null
        ? {}
        : {
            [key]: numeric
              ? {
                  kind: "NUMERIC",
                  numericValue: value,
                  recordedAt: "2026-09-30T01:00:00Z",
                }
              : {
                  kind: "BOOLEAN",
                  booleanValue: value,
                  recordedAt: "2026-09-30T01:00:00Z",
                },
          },
    currentLocalDate: "2026-09-30",
    completedAt: null,
    createdAt: "2026-09-30T00:00:00Z",
    updatedAt: "2026-09-30T00:00:00Z",
  });
}

function ruleEvent(key: string) {
  return mocks.events.get(`DAILY_RULE|daily-rule:2026-09-30:${key}`);
}

describe("progression reconciliation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.events.clear();
    mocks.connect.mockResolvedValue(undefined);
    mocks.init.mockResolvedValue(undefined);
    mocks.findOneAndUpdate.mockImplementation(
      (
        filter: Record<string, unknown>,
        update: Record<string, Record<string, unknown>>,
        options?: { upsert?: boolean },
      ) => {
        const key = `${String(filter.sourceType)}|${String(filter.sourceKey)}`;
        const existing = mocks.events.get(key);
        if (filter.status === "ACTIVE") {
          if (!existing || existing.status !== "ACTIVE") return null;
          Object.assign(existing, update.$set);
          return existing;
        }
        if (!existing && options?.upsert) {
          const created = {
            ...update.$setOnInsert,
            ...update.$set,
            createdAt: new Date("2026-09-30T01:00:00Z"),
            updatedAt: new Date("2026-09-30T01:00:00Z"),
          };
          mocks.events.set(key, created);
          return created;
        }
        if (existing) Object.assign(existing, update.$set);
        return existing ?? null;
      },
    );
    mocks.workoutExists.mockResolvedValue(false);
    mocks.workoutFind.mockResolvedValue([]);
  });

  it.each([
    ["morning_weight", true, null, 5],
    ["sleep", 7, 7, 15],
    ["hydration", 3, 3, 10],
    ["no_junk_food", true, null, 20],
    ["no_fap", true, null, 20],
    ["steps", 10_000, 10_000, 10],
    ["nutrition", true, null, 15],
    ["reading", 20, 20, 10],
    ["meditation", 10, 10, 10],
    ["journaling", true, null, 10],
    ["stretching", 10, 10, 10],
  ])("activates one %s event with snapshotted XP", async (key, value, target, xp) => {
    await reconcileDailyQuestProgression(
      "owner-1",
      config.id,
      quest(key as string, value, target),
      new Date(),
    );
    expect(ruleEvent(key as string)).toMatchObject({
      status: "ACTIVE",
      xp,
      ruleVersion: 2,
    });
  });

  it.each([
    ["morning_weight", false, null],
    ["sleep", 6, 7],
    ["hydration", 2.9, 3],
    ["no_junk_food", false, null],
    ["no_fap", false, null],
    ["steps", 9_999, 10_000],
    ["nutrition", false, null],
  ])("keeps %s inactive for NOT_RECORDED and FAIL", async (key, failingValue, target) => {
    await reconcileDailyQuestProgression(
      "owner-1",
      config.id,
      quest(key as string, null, target),
    );
    await reconcileDailyQuestProgression(
      "owner-1",
      config.id,
      quest(key as string, failingValue, target),
    );
    expect(ruleEvent(key as string)).toBeUndefined();
  });

  it("is reversible and anti-farming across PASS/FAIL/PASS toggles", async () => {
    const now = new Date("2026-09-30T01:00:00Z");
    await reconcileDailyQuestProgression(
      "owner-1",
      config.id,
      quest("no_fap", true),
      now,
    );
    const first = ruleEvent("no_fap");
    await reconcileDailyQuestProgression(
      "owner-1",
      config.id,
      quest("no_fap", false),
      new Date("2026-09-30T02:00:00Z"),
    );
    expect(ruleEvent("no_fap")).toMatchObject({ status: "REVOKED" });
    await reconcileDailyQuestProgression(
      "owner-1",
      config.id,
      quest("no_fap", true),
      new Date("2026-09-30T03:00:00Z"),
    );
    expect(ruleEvent("no_fap")).toBe(first);
    expect(ruleEvent("no_fap")).toMatchObject({
      status: "ACTIVE",
      revokedAt: null,
      earnedAt: now,
    });
    expect(
      [...mocks.events.keys()].filter((key) => key.startsWith("DAILY_RULE")),
    ).toHaveLength(1);
  });

  it("reactivates a historical V1 event without changing its XP or version", async () => {
    const earnedAt = new Date("2026-09-30T01:00:00Z");
    const legacy = {
      sourceType: "DAILY_RULE",
      sourceKey: "daily-rule:2026-09-30:sleep",
      eventType: "DAILY_RULE_PASSED",
      status: "REVOKED",
      xp: 15,
      ruleVersion: 1,
      earnedAt,
      revokedAt: new Date("2026-09-30T02:00:00Z"),
    };
    mocks.events.set("DAILY_RULE|daily-rule:2026-09-30:sleep", legacy);
    await reconcileDailyQuestProgression(
      "owner-1",
      config.id,
      quest("sleep", 7, 7),
      new Date("2026-09-30T03:00:00Z"),
    );
    expect(ruleEvent("sleep")).toBe(legacy);
    expect(ruleEvent("sleep")).toMatchObject({
      status: "ACTIVE",
      xp: 15,
      ruleVersion: 1,
      earnedAt,
      revokedAt: null,
    });
  });

  it("keeps absent and failed rules inactive and safely snapshots unknown rules at zero", async () => {
    await reconcileDailyQuestProgression("owner-1", config.id, quest("sleep", null, 7));
    expect(ruleEvent("sleep")).toBeUndefined();
    await reconcileDailyQuestProgression("owner-1", config.id, quest("sleep", 6, 7));
    expect(ruleEvent("sleep")).toBeUndefined();
    await reconcileDailyQuestProgression(
      "owner-1",
      config.id,
      quest("future_rule", true),
    );
    expect(ruleEvent("future_rule")).toMatchObject({ status: "ACTIVE", xp: 0 });
  });

  it("revokes and reactivates the same perfect-day event", async () => {
    await reconcileDailyQuestProgression("owner-1", config.id, quest("nutrition", true));
    const identity = "PERFECT_DAY|perfect-day:2026-09-30";
    const first = mocks.events.get(identity);
    expect(first).toMatchObject({ status: "ACTIVE", xp: 25 });
    await reconcileDailyQuestProgression("owner-1", config.id, quest("nutrition", false));
    expect(mocks.events.get(identity)).toMatchObject({ status: "REVOKED" });
    await reconcileDailyQuestProgression("owner-1", config.id, quest("nutrition", true));
    expect(mocks.events.get(identity)).toBe(first);
    expect(mocks.events.get(identity)).toMatchObject({ status: "ACTIVE" });
  });

  it("awards one workout-day event while any same-date session remains", async () => {
    mocks.workoutExists.mockResolvedValue(true);
    await reconcileWorkoutDayProgression("owner-1", config, "2026-09-30", 1, 1);
    await reconcileWorkoutDayProgression("owner-1", config, "2026-09-30", 1, 1);
    const identity = "WORKOUT_DAY|workout-day:2026-09-30";
    const first = mocks.events.get(identity);
    expect(first).toMatchObject({ status: "ACTIVE", xp: 30 });
    expect(
      [...mocks.events.keys()].filter((key) => key.startsWith("WORKOUT_DAY")),
    ).toHaveLength(1);
    mocks.workoutExists.mockResolvedValue(false);
    await reconcileWorkoutDayProgression("owner-1", config, "2026-09-30", 1, 1);
    expect(mocks.events.get(identity)).toMatchObject({ status: "REVOKED" });
    mocks.workoutExists.mockResolvedValue(true);
    await reconcileWorkoutDayProgression("owner-1", config, "2026-09-30", 1, 1);
    expect(mocks.events.get(identity)).toBe(first);
    expect(mocks.events.get(identity)).toMatchObject({ status: "ACTIVE" });
  });

  it("keeps workout dates independent while same-date sessions share one award", async () => {
    mocks.workoutExists.mockResolvedValue(true);
    await reconcileWorkoutDayProgression("owner-1", config, "2026-09-30", 1, 1);
    await reconcileWorkoutDayProgression("owner-1", config, "2026-09-30", 1, 1);
    await reconcileWorkoutDayProgression("owner-1", config, "2026-10-01", 2, 1);
    const active = [...mocks.events.values()].filter(
      (event) => event.sourceType === "WORKOUT_DAY" && event.status === "ACTIVE",
    );
    expect(active).toHaveLength(2);
    expect(active.reduce((sum, event) => sum + Number(event.xp), 0)).toBe(60);
  });

  it("secures, revokes, and reactivates one weekly bonus from distinct dates", async () => {
    const dates = ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];
    mocks.workoutFind.mockResolvedValue(dates.map((date) => ({ date })));
    await reconcileWorkoutWeekProgression("owner-1", config, 1, "2026-10-03");
    const identity = "WEEKLY_WORKOUT|workout-week:1:secured";
    const first = mocks.events.get(identity);
    expect(first).toMatchObject({ status: "ACTIVE", xp: 100 });
    mocks.workoutFind.mockResolvedValue(dates.slice(0, 3).map((date) => ({ date })));
    await reconcileWorkoutWeekProgression("owner-1", config, 1, "2026-10-03");
    expect(mocks.events.get(identity)).toMatchObject({ status: "REVOKED" });
    mocks.workoutFind.mockResolvedValue(dates.map((date) => ({ date })));
    await reconcileWorkoutWeekProgression("owner-1", config, 1, "2026-10-03");
    expect(mocks.events.get(identity)).toBe(first);
    expect(mocks.events.get(identity)).toMatchObject({ status: "ACTIVE" });
  });

  it("does not multiply a secured bonus at 5/4 and keeps weeks independent", async () => {
    const dates = ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
    mocks.workoutFind.mockResolvedValue(dates.map((date) => ({ date })));
    await reconcileWorkoutWeekProgression("owner-1", config, 1, "2026-10-04");
    await reconcileWorkoutWeekProgression("owner-1", config, 1, "2026-10-04");
    await reconcileWorkoutWeekProgression("owner-1", config, 2, "2026-10-11");
    const weekly = [...mocks.events.values()].filter(
      (event) => event.sourceType === "WEEKLY_WORKOUT" && event.status === "ACTIVE",
    );
    expect(weekly).toHaveLength(2);
    expect(weekly.reduce((sum, event) => sum + Number(event.xp), 0)).toBe(200);
  });
});

describe("progression summary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getProfile.mockResolvedValue({ timezone: "UTC" });
    mocks.getConfig.mockResolvedValue(config);
    mocks.connect.mockResolvedValue(undefined);
    const base = {
      status: "ACTIVE",
      ruleVersion: 1,
      earnedAt: new Date("2026-09-30T01:00:00Z"),
      sourceDate: "2026-09-30",
      challengeDay: 1,
      challengeWeek: 1,
    };
    const events = [
      {
        ...base,
        sourceType: "DAILY_RULE",
        sourceKey: "daily-rule:2026-09-30:sleep",
        eventType: "DAILY_RULE_PASSED",
        xp: 15,
      },
      {
        ...base,
        sourceType: "PERFECT_DAY",
        sourceKey: "perfect-day:2026-09-30",
        eventType: "PERFECT_DAY_COMPLETED",
        xp: 25,
      },
      {
        ...base,
        sourceType: "WORKOUT_DAY",
        sourceKey: "workout-day:2026-09-30",
        eventType: "WORKOUT_DAY_COMPLETED",
        xp: 30,
      },
      {
        ...base,
        sourceType: "WEEKLY_WORKOUT",
        sourceKey: "workout-week:1:secured",
        eventType: "WEEKLY_WORKOUT_SECURED",
        xp: 100,
      },
    ];
    mocks.eventFind.mockReturnValue({ sort: vi.fn().mockResolvedValue(events) });
    mocks.questFindOne.mockResolvedValue({
      ruleSnapshot: [
        { key: "sleep", type: "NUMERIC_MINIMUM", target: 7 },
        { key: "nutrition", type: "BOOLEAN", target: null },
      ],
    });
  });

  it("sums only active events into totals, today, week, categories, level, and rank", async () => {
    const summary = await getProgressionSummary(
      "owner-1",
      new Date("2026-09-30T12:00:00Z"),
    );
    expect(summary).toMatchObject({
      kind: "AVAILABLE",
      totalXp: 170,
      level: { current: 2, xpIntoLevel: 70, xpRequired: 120 },
      rank: { current: "E", next: "D" },
      today: {
        totalXp: 170,
        dailyQuestXp: 40,
        maxAvailableDailyQuestXp: 55,
        workoutDayXp: 30,
      },
      week: { challengeWeek: 1, xp: 170 },
      breakdown: {
        dailyRules: 15,
        perfectDays: 25,
        workoutDays: 30,
        weeklyWorkoutBonuses: 100,
      },
    });
  });

  it("returns honest setup availability without querying events", async () => {
    mocks.getProfile.mockResolvedValue(null);
    await expect(getProgressionSummary("owner-1")).resolves.toEqual({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
    });
    expect(mocks.eventFind).not.toHaveBeenCalled();
  });
});
