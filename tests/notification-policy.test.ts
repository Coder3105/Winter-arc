import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferencesInput,
} from "@/lib/validation/notification-preferences";
import {
  evaluateEventNotifications,
  evaluateTimeBasedNotifications,
  getZonedDateTime,
  isInsideQuietHours,
  isReminderSlotDue,
  type TimeBasedNotificationContext,
} from "@/server/notifications/notification-policy";

function preferences(
  patch: Partial<NotificationPreferencesInput> = {},
): NotificationPreferencesInput {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    enabled: true,
    quietHours: { ...DEFAULT_NOTIFICATION_PREFERENCES.quietHours },
    dailyQuest: { ...DEFAULT_NOTIFICATION_PREFERENCES.dailyQuest },
    morningWeight: { ...DEFAULT_NOTIFICATION_PREFERENCES.morningWeight },
    hydration: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.hydration,
      times: [...DEFAULT_NOTIFICATION_PREFERENCES.hydration.times],
    },
    steps: { ...DEFAULT_NOTIFICATION_PREFERENCES.steps },
    workout: { ...DEFAULT_NOTIFICATION_PREFERENCES.workout },
    recovery: { ...DEFAULT_NOTIFICATION_PREFERENCES.recovery },
    weeklyReport: { ...DEFAULT_NOTIFICATION_PREFERENCES.weeklyReport },
    achievementReward: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.achievementReward,
    },
    ...patch,
  };
}

function context(
  patch: Partial<TimeBasedNotificationContext> = {},
): TimeBasedNotificationContext {
  return {
    localDate: "2026-10-05",
    localTime: "20:00",
    challengeActive: true,
    challengeDay: 6,
    challengeWeek: 1,
    configuredDailyRuleCount: 7,
    quest: {
      isPerfectDay: false,
      completedRequiredRules: 5,
      totalRequiredRules: 7,
      rules: [],
    },
    weightLogged: true,
    workout: null,
    activeRecoveries: [],
    finalReportWeeks: [],
    preferences: preferences(),
    existingDedupeKeys: new Set(),
    ...patch,
  };
}

describe("notification scheduling primitives", () => {
  it("evaluates disabled, same-day, cross-midnight, and exact quiet boundaries", () => {
    expect(
      isInsideQuietHours("23:00", {
        enabled: false,
        startLocalTime: "22:30",
        endLocalTime: "07:30",
      }),
    ).toBe(false);
    const sameDay = {
      enabled: true,
      startLocalTime: "12:00",
      endLocalTime: "14:00",
    };
    expect(isInsideQuietHours("12:00", sameDay)).toBe(true);
    expect(isInsideQuietHours("13:59", sameDay)).toBe(true);
    expect(isInsideQuietHours("14:00", sameDay)).toBe(false);
    const overnight = {
      enabled: true,
      startLocalTime: "22:30",
      endLocalTime: "07:30",
    };
    expect(isInsideQuietHours("22:30", overnight)).toBe(true);
    expect(isInsideQuietHours("03:00", overnight)).toBe(true);
    expect(isInsideQuietHours("07:30", overnight)).toBe(false);
    expect(isInsideQuietHours("12:00", overnight)).toBe(false);
  });

  it("converts an instant using the authoritative IANA timezone", () => {
    expect(
      getZonedDateTime(new Date("2026-10-05T19:00:00.000Z"), "Asia/Kolkata"),
    ).toEqual({ localDate: "2026-10-06", localTime: "00:30" });
  });

  it("allows due and within-grace slots, but rejects early and stale slots", () => {
    expect(isReminderSlotDue("13:59", "14:00", 180)).toBe(false);
    expect(isReminderSlotDue("14:00", "14:00", 180)).toBe(true);
    expect(isReminderSlotDue("16:59", "14:00", 180)).toBe(true);
    expect(isReminderSlotDue("17:01", "14:00", 180)).toBe(false);
  });

  it("does not defer a slot that itself falls inside quiet hours", () => {
    const result = evaluateTimeBasedNotifications(
      context({
        localTime: "08:00",
        weightLogged: false,
        preferences: preferences({
          quietHours: {
            enabled: true,
            startLocalTime: "22:00",
            endLocalTime: "07:30",
          },
          morningWeight: { enabled: true, time: "07:00" },
        }),
      }),
    );
    expect(result.some((item) => item.type === "MORNING_WEIGHT")).toBe(false);
  });
});

describe("time-based notification policy", () => {
  it("honors global, category, challenge, quiet-hour, and dedupe gates", () => {
    expect(
      evaluateTimeBasedNotifications(
        context({ preferences: preferences({ enabled: false }) }),
      ),
    ).toEqual([]);
    expect(evaluateTimeBasedNotifications(context({ challengeActive: false }))).toEqual(
      [],
    );
    expect(
      evaluateTimeBasedNotifications(
        context({
          preferences: preferences({
            quietHours: {
              enabled: true,
              startLocalTime: "19:00",
              endLocalTime: "21:00",
            },
          }),
        }),
      ),
    ).toEqual([]);
    expect(
      evaluateTimeBasedNotifications(
        context({
          preferences: preferences({ dailyQuest: { enabled: false, time: "20:00" } }),
        }),
      ),
    ).toEqual([]);
    expect(
      evaluateTimeBasedNotifications(
        context({ existingDedupeKeys: new Set(["daily-quest:2026-10-05:20:00"]) }),
      ),
    ).toEqual([]);
  });

  it("creates generic 0/7 and partial Daily Quest reminders, never a perfect one", () => {
    const zero = evaluateTimeBasedNotifications(
      context({
        quest: {
          isPerfectDay: false,
          completedRequiredRules: 0,
          totalRequiredRules: 7,
          rules: [],
        },
      }),
    ).find((item) => item.type === "DAILY_QUEST");
    expect(zero?.body).toContain("0 / 7");
    expect(
      evaluateTimeBasedNotifications(context()).find(
        (item) => item.type === "DAILY_QUEST",
      )?.body,
    ).toContain("5 / 7");
    expect(
      evaluateTimeBasedNotifications(
        context({ quest: { ...context().quest!, isPerfectDay: true } }),
      ),
    ).toEqual([]);
  });

  it("keeps private habit names out of safe payloads and excludes explicit failures", () => {
    const notification = evaluateTimeBasedNotifications(
      context({
        quest: {
          isPerfectDay: false,
          completedRequiredRules: 4,
          totalRequiredRules: 7,
          rules: [
            {
              key: "no_fap",
              name: "No Fap",
              type: "BOOLEAN",
              target: null,
              actual: null,
              state: "NOT_RECORDED",
            },
            {
              key: "no_junk_food",
              name: "No Junk Food",
              type: "BOOLEAN",
              target: null,
              actual: false,
              state: "FAIL",
            },
          ],
        },
      }),
    ).find((item) => item.type === "DAILY_QUEST")!;
    expect(notification.body).not.toContain("Fap");
    expect(notification.body).not.toContain("Junk");
    expect(notification.privateBody).toContain("No Fap");
    expect(notification.privateBody).not.toContain("No Junk Food");
  });

  it("reminds only when today's canonical weight is absent and never exposes a value", () => {
    const missing = evaluateTimeBasedNotifications(
      context({ localTime: "09:00", weightLogged: false, quest: null }),
    ).find((item) => item.type === "MORNING_WEIGHT");
    expect(missing).toBeDefined();
    expect(`${missing?.body}${missing?.privateBody ?? ""}`).not.toMatch(/\d+\.\d+ kg/i);
    expect(
      evaluateTimeBasedNotifications(
        context({ localTime: "09:00", weightLogged: true, quest: null }),
      ).some((item) => item.type === "MORNING_WEIGHT"),
    ).toBe(false);
    expect(
      evaluateTimeBasedNotifications(
        context({ localTime: "13:01", weightLogged: false, quest: null }),
      ).some((item) => item.type === "MORNING_WEIGHT"),
    ).toBe(false);
  });

  it("uses the hydration snapshot target and suppresses equal or above target", () => {
    const hydrationRule = {
      key: "hydration",
      name: "Hydration",
      type: "NUMERIC_MINIMUM" as const,
      target: 2.5,
      actual: 1.25,
      state: "FAIL" as const,
    };
    const result = evaluateTimeBasedNotifications(
      context({
        localTime: "14:00",
        quest: { ...context().quest!, rules: [hydrationRule] },
      }),
    ).find((item) => item.type === "HYDRATION")!;
    expect(result.privateBody).toContain("1.3 / 2.5 L");
    expect(result.privateBody).not.toContain("3.0");
    for (const actual of [2.5, 3]) {
      expect(
        evaluateTimeBasedNotifications(
          context({
            localTime: "18:00",
            quest: {
              ...context().quest!,
              rules: [{ ...hydrationRule, actual, state: "PASS" }],
            },
          }),
        ).some((item) => item.type === "HYDRATION"),
      ).toBe(false);
    }
  });

  it("supports multiple hydration slots with deterministic per-slot identities", () => {
    const rule = {
      key: "hydration",
      name: "Hydration",
      type: "NUMERIC_MINIMUM" as const,
      target: 4,
      actual: 1,
      state: "FAIL" as const,
    };
    const first = evaluateTimeBasedNotifications(
      context({ localTime: "14:00", quest: { ...context().quest!, rules: [rule] } }),
    );
    const second = evaluateTimeBasedNotifications(
      context({ localTime: "18:00", quest: { ...context().quest!, rules: [rule] } }),
    );
    expect(first.some((item) => item.dedupeKey.endsWith(":14:00"))).toBe(true);
    expect(second.some((item) => item.dedupeKey.endsWith(":18:00"))).toBe(true);
  });

  it("generates steps only below the snapshot target and respects dedupe", () => {
    const rule = {
      key: "steps",
      name: "Steps",
      type: "NUMERIC_MINIMUM" as const,
      target: 8_000,
      actual: 7_240,
      state: "FAIL" as const,
    };
    const item = evaluateTimeBasedNotifications(
      context({ localTime: "19:00", quest: { ...context().quest!, rules: [rule] } }),
    ).find((candidate) => candidate.type === "STEPS")!;
    expect(item.privateBody).toContain("7,240 / 8,000");
    expect(
      evaluateTimeBasedNotifications(
        context({
          localTime: "19:00",
          quest: { ...context().quest!, rules: [{ ...rule, state: "PASS" }] },
        }),
      ).some((candidate) => candidate.type === "STEPS"),
    ).toBe(false);
    expect(
      evaluateTimeBasedNotifications(
        context({
          localTime: "19:00",
          quest: {
            ...context().quest!,
            rules: [{ ...rule, state: "NOT_APPLICABLE" }],
          },
        }),
      ).some((candidate) => candidate.type === "STEPS"),
    ).toBe(false);
  });

  it.each(["ON_TRACK", "SECURED"])("does not alert for workout state %s", (state) => {
    expect(
      evaluateTimeBasedNotifications(
        context({
          workout: {
            state,
            completedWorkoutDays: 1,
            requiredWorkoutDays: 4,
            workoutsRemaining: 3,
            daysRemaining: 5,
          },
        }),
      ).some((item) => item.type.startsWith("WORKOUT")),
    ).toBe(false);
  });

  it("creates one state-aware AT_RISK alert and a new CRITICAL no-rest-days alert", () => {
    const atRisk = evaluateTimeBasedNotifications(
      context({
        workout: {
          state: "AT_RISK",
          completedWorkoutDays: 2,
          requiredWorkoutDays: 4,
          workoutsRemaining: 2,
          daysRemaining: 3,
        },
      }),
    ).find((item) => item.type === "WORKOUT_AT_RISK")!;
    expect(atRisk.dedupeKey).toContain("at-risk");
    expect(
      evaluateTimeBasedNotifications(
        context({
          existingDedupeKeys: new Set([atRisk.dedupeKey]),
          workout: {
            state: "AT_RISK",
            completedWorkoutDays: 2,
            requiredWorkoutDays: 4,
            workoutsRemaining: 2,
            daysRemaining: 3,
          },
        }),
      ).some((item) => item.type === "WORKOUT_AT_RISK"),
    ).toBe(false);
    const critical = evaluateTimeBasedNotifications(
      context({
        existingDedupeKeys: new Set([atRisk.dedupeKey]),
        workout: {
          state: "CRITICAL",
          completedWorkoutDays: 2,
          requiredWorkoutDays: 4,
          workoutsRemaining: 2,
          daysRemaining: 2,
        },
      }),
    ).find((item) => item.type === "WORKOUT_CRITICAL")!;
    expect(critical.body).toContain("NO REST DAYS REMAIN");
    expect(critical.priority).toBe("HIGH");
  });

  it("emits at most one impossible-state notification per challenge week", () => {
    const first = evaluateTimeBasedNotifications(
      context({
        workout: {
          state: "FAILED",
          completedWorkoutDays: 0,
          requiredWorkoutDays: 4,
          workoutsRemaining: 4,
          daysRemaining: 2,
        },
      }),
    ).find((item) => item.type === "WORKOUT_FAILED")!;
    expect(first.body).toContain("Continue tracking normally");
    expect(
      evaluateTimeBasedNotifications(
        context({
          existingDedupeKeys: new Set([first.dedupeKey]),
          workout: {
            state: "FAILED",
            completedWorkoutDays: 0,
            requiredWorkoutDays: 4,
            workoutsRemaining: 4,
            daysRemaining: 2,
          },
        }),
      ).some((item) => item.type === "WORKOUT_FAILED"),
    ).toBe(false);
  });

  it("creates per-day recovery reminders and FINAL report-ready notices", () => {
    const items = evaluateTimeBasedNotifications(
      context({
        localTime: "20:00",
        activeRecoveries: [{ id: "recovery-1", type: "DAILY_RECOVERY" }],
        finalReportWeeks: [1],
      }),
    );
    expect(items.find((item) => item.type === "RECOVERY")?.dedupeKey).toContain(
      "2026-10-05",
    );
    expect(items.find((item) => item.type === "WEEKLY_REPORT_READY")?.actionRoute).toBe(
      "/reports/week/1",
    );
  });

  it("orders ceiling candidates by the explicit V1 category priority", () => {
    const items = evaluateTimeBasedNotifications(
      context({
        weightLogged: false,
        workout: {
          state: "CRITICAL",
          completedWorkoutDays: 2,
          requiredWorkoutDays: 4,
          workoutsRemaining: 2,
          daysRemaining: 2,
        },
        activeRecoveries: [{ id: "recovery-1", type: "DAILY_RECOVERY" }],
      }),
    );
    expect(items.slice(0, 3).map((item) => item.type)).toEqual([
      "WORKOUT_CRITICAL",
      "DAILY_QUEST",
      "RECOVERY",
    ]);
  });
});

describe("event notification policy", () => {
  const eventContext = {
    preferences: preferences(),
    existingDedupeKeys: new Set<string>(),
    achievements: [
      {
        key: "NO_FAP_STREAK_7",
        name: "PRIVATE RULE STREAK",
        challengeDay: 7,
        challengeWeek: 1,
      },
    ],
    rewards: [
      { key: "level-5", title: "LEVEL 5 EMBLEM", challengeDay: null, challengeWeek: 2 },
    ],
    completedRecoveries: [
      { id: "recovery-1", type: "DAILY_RECOVERY" as const, challengeWeek: 1 },
    ],
    level: 6,
    rank: "D",
  };

  it("creates achievement, reward, recovery-cleared, final-level, and rank events", () => {
    const items = evaluateEventNotifications(eventContext);
    expect(items.map((item) => item.type)).toEqual([
      "ACHIEVEMENT",
      "REWARD",
      "RECOVERY_CLEARED",
      "LEVEL_UP",
      "RANK_UP",
    ]);
  });

  it("keeps sensitive achievement details out of the safe payload", () => {
    const item = evaluateEventNotifications(eventContext).find(
      (candidate) => candidate.type === "ACHIEVEMENT",
    )!;
    expect(`${item.title} ${item.body}`).not.toMatch(/fap|sexual/i);
    expect(item.body).toContain("PRIVATE DISCIPLINE MILESTONE");
  });

  it("deduplicates repeat events and honors category preferences", () => {
    const deduped = evaluateEventNotifications({
      ...eventContext,
      existingDedupeKeys: new Set([
        "achievement:NO_FAP_STREAK_7",
        "reward:level-5",
        "recovery-cleared:recovery-1",
        "level:6",
        "rank:D",
      ]),
    });
    expect(deduped).toEqual([]);
    const disabled = evaluateEventNotifications({
      ...eventContext,
      preferences: preferences({
        achievementReward: { enabled: false },
        recovery: { enabled: false },
      }),
    });
    expect(disabled).toEqual([]);
  });
});
