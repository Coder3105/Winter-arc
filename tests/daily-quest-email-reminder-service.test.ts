import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  profileFind: vi.fn(),
  preferenceFind: vi.fn(),
  configFind: vi.fn(),
  questFind: vi.fn(),
  deliveryInit: vi.fn(),
  deliveryUpdate: vi.fn(),
  deliveryClaim: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/models/user-profile", () => ({
  UserProfileModel: { findOne: mocks.profileFind },
}));
vi.mock("@/server/models/notification-preferences", () => ({
  NotificationPreferencesModel: { findOne: mocks.preferenceFind },
}));
vi.mock("@/server/models/winter-arc-config", () => ({
  WinterArcConfigModel: { findOne: mocks.configFind },
}));
vi.mock("@/server/models/daily-quest-record", () => ({
  DailyQuestRecordModel: { findOne: mocks.questFind },
}));
vi.mock("@/server/models/daily-quest-email-delivery", () => ({
  DAILY_QUEST_EMAIL_DELIVERY_TYPE: "DAILY_QUEST_REMINDER",
  DailyQuestEmailDeliveryModel: {
    init: mocks.deliveryInit,
    updateOne: mocks.deliveryUpdate,
    findOneAndUpdate: mocks.deliveryClaim,
  },
}));

import { sendDailyQuestEmailReminderForOwner } from "@/server/services/daily-quest-email-reminder-service";

const userId = new mongoose.Types.ObjectId();
const configId = new mongoose.Types.ObjectId();
const deliveryId = new mongoose.Types.ObjectId();
const now = new Date("2026-01-15T12:30:00.000Z"); // 18:00 Asia/Kolkata

function selectable<T>(value: T) {
  const promise = Promise.resolve(value);
  return {
    select: vi.fn().mockResolvedValue(value),
    then: promise.then.bind(promise),
  };
}

function owner(patch: Record<string, unknown> = {}) {
  return {
    _id: userId,
    email: "verified@example.test",
    emailVerifiedAt: new Date("2025-12-01T00:00:00.000Z"),
    status: "ACTIVE" as const,
    isActive: true,
    ...patch,
  };
}

function rules(count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    key: index === 0 ? "no_fap" : `rule_${index}`,
    name: index === 0 ? "No Fap" : `Rule ${index}`,
    category: "DAILY",
    enabled: true,
    type: "BOOLEAN" as const,
    target: null,
    unit: null,
    requiredFrequency: 7,
    order: index,
  }));
}

function questRecord(completed: number, total = 4) {
  const responses = new Map();
  for (let index = 0; index < completed; index += 1)
    responses.set(index === 0 ? "no_fap" : `rule_${index}`, {
      kind: "BOOLEAN",
      booleanValue: true,
      recordedAt: now,
    });
  return {
    _id: new mongoose.Types.ObjectId(),
    userId,
    winterArcConfigId: configId,
    date: "2026-01-15",
    timezone: "Asia/Kolkata",
    challengeDay: 15,
    challengeWeek: 3,
    ruleSnapshot: rules(total),
    responses,
    completedAt: completed === total ? now : null,
    dailyNote: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("Daily Quest scheduled email service", () => {
  const send = vi.fn();
  const dependencies = {
    provider: { send },
    applicationOrigin: "https://winter.example.test",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.profileFind.mockResolvedValue({ timezone: "Asia/Kolkata" });
    mocks.preferenceFind.mockImplementation(() =>
      selectable({ dailyQuestEmailReminder: true }),
    );
    mocks.configFind.mockReturnValue({
      sort: vi.fn().mockResolvedValue({
        _id: configId,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        durationDays: 90,
        rules: rules(),
      }),
    });
    mocks.questFind.mockResolvedValue(questRecord(3));
    mocks.deliveryInit.mockResolvedValue(undefined);
    mocks.deliveryUpdate.mockResolvedValue({ acknowledged: true });
    mocks.deliveryClaim.mockResolvedValue({ _id: deliveryId });
    send.mockResolvedValue(undefined);
  });

  it("sends an awaited generic 3/4 reminder to the verified account email", async () => {
    await expect(
      sendDailyQuestEmailReminderForOwner(owner(), now, dependencies),
    ).resolves.toEqual({ outcome: "SENT", eligible: true });
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        to: "verified@example.test",
        subject: "Winter Arc \u2014 Daily Quest Pending",
        text: expect.stringContaining("3 / 4 objectives"),
      }),
    );
    const message = send.mock.calls[0]![0];
    const visible = `${message.html.replace(/<[^>]+>/g, " ")}${message.text}`;
    expect(visible).not.toMatch(/No Fap|no_fap|weight|OTP/i);
    expect(mocks.deliveryUpdate).toHaveBeenLastCalledWith(
      { _id: deliveryId, state: "SENDING" },
      { $set: { state: "SENT", sentAt: now, failureCode: null } },
    );
  });

  it.each([
    [0, 4, "SENT"],
    [3, 4, "SENT"],
    [4, 4, "SKIPPED_COMPLETE"],
  ] as const)("evaluates dynamic completion %i/%i", async (completed, total, outcome) => {
    mocks.questFind.mockResolvedValue(questRecord(completed, total));
    const result = await sendDailyQuestEmailReminderForOwner(owner(), now, dependencies);
    expect(result.outcome).toBe(outcome);
    expect(send).toHaveBeenCalledTimes(outcome === "SENT" ? 1 : 0);
  });

  it("requires opt-in, a verified email, and an active account", async () => {
    mocks.preferenceFind.mockImplementation(() =>
      selectable({ dailyQuestEmailReminder: false }),
    );
    await expect(
      sendDailyQuestEmailReminderForOwner(owner(), now, dependencies),
    ).resolves.toMatchObject({ outcome: "SKIPPED_PREFERENCE" });
    await expect(
      sendDailyQuestEmailReminderForOwner(
        owner({ emailVerifiedAt: null }),
        now,
        dependencies,
      ),
    ).resolves.toMatchObject({ outcome: "SKIPPED_EMAIL" });
    await expect(
      sendDailyQuestEmailReminderForOwner(
        owner({ status: "DISABLED" }),
        now,
        dependencies,
      ),
    ).resolves.toMatchObject({ outcome: "SKIPPED_ACCOUNT" });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects invalid timezones, pre-start, Day 91, and outside-window runs", async () => {
    mocks.profileFind.mockResolvedValueOnce({ timezone: "Not/A_Timezone" });
    await expect(
      sendDailyQuestEmailReminderForOwner(owner(), now, dependencies),
    ).resolves.toMatchObject({ outcome: "SKIPPED_TIMEZONE" });
    await expect(
      sendDailyQuestEmailReminderForOwner(
        owner(),
        new Date("2026-01-15T11:30:00.000Z"),
        dependencies,
      ),
    ).resolves.toMatchObject({ outcome: "SKIPPED_WINDOW" });
    await expect(
      sendDailyQuestEmailReminderForOwner(
        owner(),
        new Date("2025-12-15T12:30:00.000Z"),
        dependencies,
      ),
    ).resolves.toMatchObject({ outcome: "SKIPPED_CHALLENGE" });
    await expect(
      sendDailyQuestEmailReminderForOwner(
        owner(),
        new Date("2026-04-01T12:30:00.000Z"),
        dependencies,
      ),
    ).resolves.toMatchObject({ outcome: "SKIPPED_CHALLENGE" });
    expect(send).not.toHaveBeenCalled();
  });

  it("allows Day 90 and blocks a second or concurrent claim", async () => {
    const day90 = new Date("2026-03-31T12:30:00.000Z");
    mocks.questFind.mockResolvedValue(null);
    mocks.deliveryClaim
      .mockResolvedValueOnce({ _id: deliveryId })
      .mockResolvedValue(null);
    const first = sendDailyQuestEmailReminderForOwner(owner(), day90, dependencies);
    const second = sendDailyQuestEmailReminderForOwner(owner(), day90, dependencies);
    const outcomes = await Promise.all([first, second]);
    expect(outcomes.map((item) => item.outcome).sort()).toEqual([
      "SENT",
      "SKIPPED_DEDUPE",
    ]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("handles India/New York, complete, and opted-out owners independently", async () => {
    const outcomes = [];
    outcomes.push(
      (await sendDailyQuestEmailReminderForOwner(owner(), now, dependencies)).outcome,
    );

    mocks.profileFind.mockResolvedValue({ timezone: "America/New_York" });
    outcomes.push(
      (await sendDailyQuestEmailReminderForOwner(owner(), now, dependencies)).outcome,
    );

    mocks.profileFind.mockResolvedValue({ timezone: "Asia/Kolkata" });
    mocks.questFind.mockResolvedValue(questRecord(4));
    outcomes.push(
      (await sendDailyQuestEmailReminderForOwner(owner(), now, dependencies)).outcome,
    );

    mocks.preferenceFind.mockImplementation(() =>
      selectable({ dailyQuestEmailReminder: false }),
    );
    outcomes.push(
      (await sendDailyQuestEmailReminderForOwner(owner(), now, dependencies)).outcome,
    );

    expect(outcomes).toEqual([
      "SENT",
      "SKIPPED_WINDOW",
      "SKIPPED_COMPLETE",
      "SKIPPED_PREFERENCE",
    ]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("records only a sanitized failure and permits bounded FAILED-state retry", async () => {
    send.mockRejectedValueOnce(new Error("smtp password leaked here"));
    await expect(
      sendDailyQuestEmailReminderForOwner(owner(), now, dependencies),
    ).resolves.toEqual({ outcome: "FAILED", eligible: true });
    expect(mocks.deliveryUpdate).toHaveBeenLastCalledWith(
      { _id: deliveryId, state: "SENDING" },
      {
        $set: {
          state: "FAILED",
          failedAt: now,
          failureCode: "EMAIL_DELIVERY_FAILED",
        },
      },
    );
    expect(JSON.stringify(mocks.deliveryUpdate.mock.calls)).not.toContain(
      "smtp password leaked here",
    );
    expect(mocks.deliveryClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        state: { $in: ["PENDING", "FAILED"] },
        attemptCount: { $lt: 3 },
      }),
      expect.anything(),
      expect.anything(),
    );
  });
});
