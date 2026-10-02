import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  getProfile: vi.fn(),
  getConfig: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
  init: vi.fn(),
  weightExists: vi.fn(),
  reconcileProgression: vi.fn(),
  reconcilePhase9: vi.fn(),
  reconcileNotifications: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/services/profile-service", () => ({ getProfile: mocks.getProfile }));
vi.mock("@/server/services/winter-arc-service", () => ({
  getWinterArcConfig: mocks.getConfig,
}));
vi.mock("@/server/models/daily-quest-record", () => ({
  DailyQuestRecordModel: {
    findOneAndUpdate: mocks.findOneAndUpdate,
    findOne: mocks.findOne,
    updateOne: mocks.updateOne,
    init: mocks.init,
  },
}));
vi.mock("@/server/models/weight-record", () => ({
  WeightRecordModel: { exists: mocks.weightExists },
}));
vi.mock("@/server/services/progression-service", () => ({
  reconcileDailyQuestProgression: mocks.reconcileProgression,
}));
vi.mock("@/server/services/achievement-reward-service", () => ({
  reconcilePhase9Systems: mocks.reconcilePhase9,
}));
vi.mock("@/server/services/notification-service", () => ({
  reconcileEventNotifications: mocks.reconcileNotifications,
}));

import { createDefaultDailyRules } from "@/features/winter-arc/rules";
import { AppError } from "@/server/errors/app-error";
import {
  getDailyQuestByDate,
  getOrCreateTodayDailyQuest,
  updateTodayDailyQuestResponse,
} from "@/server/services/daily-quest-service";

const profile = {
  id: "profile-1",
  displayName: "Owner",
  dateOfBirth: null,
  ageAtBaseline: 24,
  sex: "male",
  heightCm: 178,
  preferredWeightUnit: "kg",
  preferredDistanceUnit: "km",
  timezone: "Asia/Kolkata",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

function config() {
  return {
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
      ...createDefaultDailyRules(),
      {
        key: "disabled_rule",
        name: "Disabled",
        category: "test",
        enabled: false,
        type: "BOOLEAN" as const,
        target: null,
        unit: null,
        requiredFrequency: 7,
        order: 8,
      },
      {
        key: "workout",
        name: "Workout",
        category: "movement",
        enabled: true,
        type: "BOOLEAN" as const,
        target: null,
        unit: null,
        requiredFrequency: 4,
        order: 9,
      },
    ],
    notificationPreferences: { enabled: false },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as const;
}

function documentFromInsert(update: { $setOnInsert: Record<string, unknown> }) {
  const inserted = update.$setOnInsert;
  return {
    _id: { toString: () => "quest-1" },
    ...inserted,
    responses: new Map(),
    completedAt: null,
    createdAt: new Date("2026-09-30T00:00:00.000Z"),
    updatedAt: new Date("2026-09-30T00:00:00.000Z"),
  };
}

describe("Daily Quest creation service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.init.mockResolvedValue(undefined);
    mocks.getProfile.mockResolvedValue(profile);
    mocks.getConfig.mockResolvedValue(config());
    mocks.findOneAndUpdate.mockImplementation((_filter, update) =>
      Promise.resolve(documentFromInsert(update)),
    );
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.weightExists.mockResolvedValue(null);
  });

  it("same-date responses modify only their authenticated user's quest", async () => {
    const records = new Map<string, ReturnType<typeof documentFromInsert>>();
    mocks.getConfig.mockImplementation((userId: string) =>
      Promise.resolve({ ...config(), id: "config-" + userId }),
    );
    mocks.findOneAndUpdate.mockImplementation((filter, update) => {
      const userId = filter.userId as string;
      if (update.$setOnInsert) {
        if (!records.has(userId))
          records.set(userId, {
            ...documentFromInsert(update),
            _id: { toString: () => "quest-" + userId },
          });
        return Promise.resolve(records.get(userId));
      }
      const record = records.get(userId);
      if (!record || filter._id !== record._id.toString()) return Promise.resolve(null);
      for (const [key, value] of Object.entries(update.$set ?? {})) {
        if (key.startsWith("responses.")) record.responses.set(key.slice(10), value);
      }
      return Promise.resolve(record);
    });
    const now = new Date("2026-10-01T06:00:00Z");
    await getOrCreateTodayDailyQuest("user-a", now);
    await getOrCreateTodayDailyQuest("user-b", now);
    await updateTodayDailyQuestResponse("user-a", { key: "sleep", value: 8 }, now);
    expect(records.get("user-a")?.responses.get("sleep")).toMatchObject({
      numericValue: 8,
    });
    expect(records.get("user-b")?.responses.has("sleep")).toBe(false);
    expect(records).toHaveLength(2);
  });

  it("creates one local-date record with challenge day/week and enabled snapshots", async () => {
    const result = await getOrCreateTodayDailyQuest(
      "owner-1",
      new Date("2026-10-06T20:00:00.000Z"),
    );
    expect(result.kind).toBe("AVAILABLE");
    if (result.kind !== "AVAILABLE") return;
    expect(result.quest).toMatchObject({
      date: "2026-10-07",
      timezone: "Asia/Kolkata",
      challengeDay: 8,
      challengeWeek: 2,
      totalRequiredRules: 7,
    });
    expect(result.quest.rules.map((rule) => rule.key)).not.toContain("disabled_rule");
    expect(result.quest.rules.map((rule) => rule.key)).not.toContain("workout");
    const [, update, options] = mocks.findOneAndUpdate.mock.calls[0]!;
    expect(update.$setOnInsert.ruleSnapshot).toHaveLength(7);
    expect(options).toMatchObject({ upsert: true, returnDocument: "after" });
  });

  it("is idempotent under repeated and concurrent access", async () => {
    const repeated = await getOrCreateTodayDailyQuest(
      "owner-1",
      new Date("2026-09-30T06:00:00Z"),
    );
    const [left, right] = await Promise.all([
      getOrCreateTodayDailyQuest("owner-1", new Date("2026-09-30T06:00:00Z")),
      getOrCreateTodayDailyQuest("owner-1", new Date("2026-09-30T06:00:00Z")),
    ]);
    expect(repeated).toEqual(left);
    expect(left).toEqual(right);
    expect(
      mocks.findOneAndUpdate.mock.calls.every(([filter]) => filter.date === "2026-09-30"),
    ).toBe(true);
  });

  it("recovers a duplicate-key upsert race by reading the winner", async () => {
    const winner = documentFromInsert({
      $setOnInsert: {
        userId: "owner-1",
        winterArcConfigId: "config-1",
        date: "2026-09-30",
        timezone: "Asia/Kolkata",
        challengeDay: 1,
        challengeWeek: 1,
        ruleSnapshot: createDefaultDailyRules(),
        completedAt: null,
      },
    });
    mocks.findOneAndUpdate.mockRejectedValueOnce({ code: 11000 });
    mocks.findOne.mockResolvedValueOnce(winner);
    const result = await getOrCreateTodayDailyQuest(
      "owner-1",
      new Date("2026-09-30T06:00:00Z"),
    );
    expect(result.kind).toBe("AVAILABLE");
    expect(mocks.findOne).toHaveBeenCalledOnce();
  });

  it("preserves the first snapshot when configuration later changes", async () => {
    let stored: ReturnType<typeof documentFromInsert> | undefined;
    mocks.findOneAndUpdate.mockImplementation((_filter, update) => {
      stored ??= documentFromInsert(update);
      return Promise.resolve(stored);
    });
    const first = await getOrCreateTodayDailyQuest(
      "owner-1",
      new Date("2026-09-30T06:00:00Z"),
    );
    const original = config();
    const changed = {
      ...original,
      rules: original.rules.map((rule) =>
        rule.key === "hydration" ? { ...rule, target: 3.5 } : rule,
      ),
    };
    mocks.getConfig.mockResolvedValue(changed);
    const second = await getOrCreateTodayDailyQuest(
      "owner-1",
      new Date("2026-09-30T12:00:00Z"),
    );
    if (first.kind !== "AVAILABLE" || second.kind !== "AVAILABLE") throw new Error();
    expect(first.quest.rules.find((rule) => rule.key === "hydration")?.target).toBe(3);
    expect(second.quest.rules.find((rule) => rule.key === "hydration")?.target).toBe(3);
  });

  it.each([
    [null, config(), "PROFILE_REQUIRED"],
    [profile, null, "WINTER_ARC_NOT_ACTIVE"],
    [profile, { ...config(), status: "DRAFT" }, "WINTER_ARC_NOT_ACTIVE"],
  ])("returns setup availability state", async (profileResult, configResult, reason) => {
    mocks.getProfile.mockResolvedValue(profileResult);
    mocks.getConfig.mockResolvedValue(configResult);
    await expect(getOrCreateTodayDailyQuest("owner-1")).resolves.toMatchObject({
      kind: "UNAVAILABLE",
      reason,
    });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-09-29T06:00:00Z", "PROTOCOL_NOT_STARTED"],
    ["2026-12-29T06:00:00Z", "WINTER_ARC_COMPLETE"],
  ])("does not generate records outside the protocol (%s)", async (now, reason) => {
    await expect(
      getOrCreateTodayDailyQuest("owner-1", new Date(now)),
    ).resolves.toMatchObject({ kind: "UNAVAILABLE", reason });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("Daily Quest response updates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.init.mockResolvedValue(undefined);
    mocks.getProfile.mockResolvedValue(profile);
    mocks.getConfig.mockResolvedValue(config());
    let stored: ReturnType<typeof documentFromInsert>;
    mocks.findOneAndUpdate.mockImplementation((_filter, update) => {
      if (update.$setOnInsert) {
        stored ??= documentFromInsert(update);
      } else if (update.$set) {
        const [path, response] = Object.entries(update.$set)[0]!;
        stored.responses.set(path.replace("responses.", ""), response);
        stored.updatedAt = new Date("2026-09-30T10:00:00Z");
      } else if (update.$unset) {
        const path = Object.keys(update.$unset)[0]!;
        stored.responses.delete(path.replace("responses.", ""));
        stored.updatedAt = new Date("2026-09-30T10:00:00Z");
      }
      return Promise.resolve(stored);
    });
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.weightExists.mockResolvedValue(null);
  });

  it.each([
    ["no_junk_food", true, "PASS"],
    ["no_junk_food", false, "FAIL"],
    ["no_fap", true, "PASS"],
    ["nutrition", false, "FAIL"],
    ["sleep", 7.5, "PASS"],
    ["hydration", 2.5, "FAIL"],
    ["hydration", 3, "PASS"],
    ["steps", 10_000, "PASS"],
  ] as const)("persists and evaluates %s=%s", async (key, value, state) => {
    const quest = await updateTodayDailyQuestResponse(
      "owner-1",
      { key, value },
      new Date("2026-09-30T06:00:00Z"),
    );
    expect(quest.rules.find((rule) => rule.key === key)).toMatchObject({
      actual: value,
      state,
    });
  });

  it("rejects direct morning-weight responses because WeightRecord is authoritative", async () => {
    await expect(
      updateTodayDailyQuestResponse(
        "owner-1",
        { key: "morning_weight", value: true },
        new Date("2026-09-30T06:00:00Z"),
      ),
    ).rejects.toMatchObject({ code: "WEIGHT_SOURCE_REQUIRED" });
  });

  it("derives morning weight PASS from WeightRecord while preserving other responses", async () => {
    await updateTodayDailyQuestResponse(
      "owner-1",
      { key: "no_junk_food", value: true },
      new Date("2026-09-30T06:00:00Z"),
    );
    mocks.weightExists.mockResolvedValue({ _id: "weight-1" });
    const result = await getOrCreateTodayDailyQuest(
      "owner-1",
      new Date("2026-09-30T07:00:00Z"),
    );
    expect(result.kind).toBe("AVAILABLE");
    if (result.kind === "AVAILABLE") {
      expect(
        result.quest.rules.find((rule) => rule.key === "morning_weight"),
      ).toMatchObject({
        actual: true,
        state: "PASS",
      });
      expect(
        result.quest.rules.find((rule) => rule.key === "no_junk_food"),
      ).toMatchObject({
        actual: true,
        state: "PASS",
      });
    }
  });

  it("unsets morning weight after source deletion instead of recording FAIL", async () => {
    mocks.weightExists.mockResolvedValue({ _id: "weight-1" });
    await getOrCreateTodayDailyQuest("owner-1", new Date("2026-09-30T06:00:00Z"));
    mocks.weightExists.mockResolvedValue(null);
    const result = await getOrCreateTodayDailyQuest(
      "owner-1",
      new Date("2026-09-30T07:00:00Z"),
    );
    expect(result.kind).toBe("AVAILABLE");
    if (result.kind === "AVAILABLE") {
      expect(
        result.quest.rules.find((rule) => rule.key === "morning_weight"),
      ).toMatchObject({
        actual: null,
        state: "NOT_RECORDED",
      });
    }
  });

  it("supports absolute hydration accumulation without duplicate client deltas", async () => {
    let quest = await updateTodayDailyQuestResponse(
      "owner-1",
      { key: "hydration", value: 0.25 },
      new Date("2026-09-30T06:00:00Z"),
    );
    quest = await updateTodayDailyQuestResponse(
      "owner-1",
      { key: "hydration", value: 0.75 },
      new Date("2026-09-30T06:00:00Z"),
    );
    expect(quest.rules.find((rule) => rule.key === "hydration")?.actual).toBe(0.75);
  });

  it.each([
    ["unknown", true],
    ["sleep", true],
    ["no_fap", 1],
    ["hydration", -1],
    ["hydration", NaN],
    ["steps", 1.5],
    ["steps", Infinity],
  ])("rejects invalid update %s=%s", async (key, value) => {
    const code = key === "unknown" ? "RULE_NOT_FOUND" : "INVALID_RULE_VALUE";
    await expect(
      updateTodayDailyQuestResponse(
        "owner-1",
        { key, value },
        new Date("2026-09-30T06:00:00Z"),
      ),
    ).rejects.toMatchObject({ code });
  });

  it.each(["reading", "meditation", "stretching"])(
    "rejects fractional whole-minute values for %s",
    async (key) => {
      const base = config();
      mocks.getConfig.mockResolvedValue({
        ...base,
        rules: [
          ...base.rules,
          {
            key,
            name: key.toUpperCase(),
            category: "GROWTH",
            enabled: true,
            type: "NUMERIC_MINIMUM",
            target: 10,
            unit: "minutes",
            requiredFrequency: 7,
            order: 10,
          },
        ],
      });
      await expect(
        updateTodayDailyQuestResponse(
          "owner-1",
          { key, value: 1.5 },
          new Date("2026-09-30T06:00:00Z"),
        ),
      ).rejects.toMatchObject({ code: "INVALID_RULE_VALUE" });
    },
  );
});

describe("historical date read", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.init.mockResolvedValue(undefined);
    mocks.getProfile.mockResolvedValue(profile);
    mocks.getConfig.mockResolvedValue(config());
  });

  it("returns an owner-scoped existing date without creating it", async () => {
    const existing = documentFromInsert({
      $setOnInsert: {
        userId: "owner-1",
        winterArcConfigId: "config-1",
        date: "2026-10-01",
        timezone: "Asia/Kolkata",
        challengeDay: 2,
        challengeWeek: 1,
        ruleSnapshot: createDefaultDailyRules(),
        completedAt: null,
      },
    });
    mocks.findOne.mockResolvedValue(existing);
    const result = await getDailyQuestByDate(
      "owner-1",
      "2026-10-01",
      new Date("2026-10-02T06:00:00Z"),
    );
    expect(result).toMatchObject({ date: "2026-10-01", status: "MISSED" });
    expect(mocks.findOne).toHaveBeenCalledWith({
      userId: "owner-1",
      winterArcConfigId: "config-1",
      date: "2026-10-01",
    });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns null for a missing valid historical record", async () => {
    mocks.findOne.mockResolvedValue(null);
    await expect(getDailyQuestByDate("owner-1", "2026-10-01")).resolves.toBeNull();
  });

  it.each(["2026-09-29", "2026-12-29"])(
    "rejects out-of-challenge date %s",
    async (date) => {
      await expect(getDailyQuestByDate("owner-1", date)).rejects.toBeInstanceOf(AppError);
      expect(mocks.findOne).not.toHaveBeenCalled();
    },
  );
});
