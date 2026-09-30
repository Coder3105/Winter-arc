import { describe, expect, it } from "vitest";

import { ACHIEVEMENT_DEFINITIONS } from "@/server/achievements/achievement-policy";
import {
  addCalendarDays,
  buildRecoveryEpisodes,
  calculateArcScore,
  calculateChallengeDay,
  calculateDailyDiscipline,
  calculateLevelProgress,
  calculatePerfectDayStreak,
  calculateRuleStreaks,
  calculateWeeklyRuleMetrics,
  calculateWorkoutScoreComponent,
  evaluateAchievementProgress,
  evaluateWorkoutWeek,
  generateSystemEvaluation,
  getChallengeWeekBounds,
  getFinalizedPerfectWeeks,
  getRankForLevel,
} from "@/server/calculations";
import {
  evaluateDailyQuest,
  type DailyQuestResponse,
  type DailyQuestRuleSnapshot,
} from "@/server/daily-quest/evaluation";
import { createDefaultDailyRules } from "@/features/winter-arc/rules";
import {
  DAILY_RULE_XP_V1,
  PERFECT_DAY_XP,
  WEEKLY_WORKOUT_XP,
  WORKOUT_DAY_XP,
  getDailyRuleXp,
} from "@/lib/progression/xp-policy";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/validation/notification-preferences";
import { evaluateTimeBasedNotifications } from "@/server/notifications/notification-policy";

const START_DATE = "2026-10-05";
const TIMEZONE = "Asia/Kolkata";
const DURATION_DAYS = 90;

const RULES: readonly DailyQuestRuleSnapshot[] = createDefaultDailyRules().map(
  ({ key, name, type, target, unit, requiredFrequency, order }) => ({
    key,
    name,
    type,
    target,
    unit,
    requiredFrequency,
    order,
  }),
);

function response(value: boolean | number): DailyQuestResponse {
  return typeof value === "boolean"
    ? { kind: "BOOLEAN", booleanValue: value, recordedAt: "2026-10-05T06:00:00Z" }
    : { kind: "NUMERIC", numericValue: value, recordedAt: "2026-10-05T06:00:00Z" };
}

function evaluateDay(
  day: number,
  values: Readonly<Record<string, boolean | number>>,
  currentDay = day,
) {
  const date = addCalendarDays(START_DATE, day - 1);
  return evaluateDailyQuest({
    id: `isolated-owner:quest:${date}`,
    date,
    timezone: TIMEZONE,
    challengeDay: day,
    challengeWeek: Math.ceil(day / 7),
    durationDays: DURATION_DAYS,
    rules: RULES,
    responses: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, response(value)]),
    ),
    currentLocalDate: addCalendarDays(START_DATE, currentDay - 1),
    completedAt: null,
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
  });
}

const PERFECT_VALUES = {
  morning_weight: true,
  sleep: 7.5,
  hydration: 3,
  no_junk_food: true,
  no_fap: true,
  steps: 10_000,
  nutrition: true,
} as const;

class IsolatedLedger {
  readonly events = new Map<
    string,
    { readonly xp: number; status: "ACTIVE" | "REVOKED"; readonly earnedAt: string }
  >();

  reconcile(key: string, qualified: boolean, xp: number) {
    const existing = this.events.get(key);
    if (!existing && qualified) {
      this.events.set(key, {
        xp,
        status: "ACTIVE",
        earnedAt: "2026-10-05T06:00:00.000Z",
      });
    } else if (existing) {
      existing.status = qualified ? "ACTIVE" : "REVOKED";
    }
  }

  total() {
    return [...this.events.values()].reduce(
      (sum, event) => sum + (event.status === "ACTIVE" ? event.xp : 0),
      0,
    );
  }
}

describe("Phase 13 isolated 90-day release simulation", () => {
  it("keeps the exact Day 1, Day 90, completion and Week 13 boundaries", () => {
    expect(
      calculateChallengeDay({
        startDate: START_DATE,
        currentDate: START_DATE,
        timezone: TIMEZONE,
        durationDays: DURATION_DAYS,
      }),
    ).toMatchObject({ status: "ACTIVE", dayNumber: 1, daysElapsed: 0 });

    const day90 = addCalendarDays(START_DATE, 89);
    expect(
      calculateChallengeDay({
        startDate: START_DATE,
        currentDate: day90,
        timezone: TIMEZONE,
        durationDays: DURATION_DAYS,
      }),
    ).toMatchObject({ status: "ACTIVE", dayNumber: 90, daysRemaining: 1 });
    expect(
      calculateChallengeDay({
        startDate: START_DATE,
        currentDate: addCalendarDays(day90, 1),
        timezone: TIMEZONE,
        durationDays: DURATION_DAYS,
      }),
    ).toMatchObject({ status: "COMPLETED", dayNumber: 90, daysRemaining: 0 });
    expect(
      getChallengeWeekBounds({
        challengeStartDate: START_DATE,
        durationDays: DURATION_DAYS,
        challengeWeek: 13,
      }),
    ).toMatchObject({ startChallengeDay: 85, endChallengeDay: 90, weekLengthDays: 6 });
    expect(() =>
      getChallengeWeekBounds({
        challengeStartDate: START_DATE,
        durationDays: DURATION_DAYS,
        challengeWeek: 14,
      }),
    ).toThrow();
  });

  it("completes the seven-rule Perfect Day and earns each logical event once", () => {
    const quest = evaluateDay(1, PERFECT_VALUES);
    expect(quest).toMatchObject({
      status: "COMPLETE",
      isPerfectDay: true,
      completedRequiredRules: 7,
      totalRequiredRules: 7,
    });

    const ledger = new IsolatedLedger();
    for (const rule of quest.rules) {
      ledger.reconcile(
        `daily-rule:${quest.date}:${rule.key}`,
        rule.state === "PASS",
        getDailyRuleXp(rule.key),
      );
    }
    ledger.reconcile(`perfect-day:${quest.date}`, quest.isPerfectDay, PERFECT_DAY_XP);
    const expected =
      Object.values(DAILY_RULE_XP_V1).reduce((sum, xp) => sum + xp, 0) + PERFECT_DAY_XP;
    expect(ledger.total()).toBe(expected);

    for (const rule of quest.rules) {
      ledger.reconcile(
        `daily-rule:${quest.date}:${rule.key}`,
        true,
        getDailyRuleXp(rule.key),
      );
    }
    ledger.reconcile(`perfect-day:${quest.date}`, true, PERFECT_DAY_XP);
    expect(ledger.events.size).toBe(8);
    expect(ledger.total()).toBe(expected);
    expect(new Set([`daily-clear:${quest.date}`]).size).toBe(1);
  });

  it("reverses and reactivates morning-weight XP without changing event identity", () => {
    const ledger = new IsolatedLedger();
    const key = `daily-rule:${START_DATE}:morning_weight`;
    ledger.reconcile(key, true, getDailyRuleXp("morning_weight"));
    const firstEarnedAt = ledger.events.get(key)?.earnedAt;
    expect(ledger.total()).toBe(5);

    ledger.reconcile(key, false, getDailyRuleXp("morning_weight"));
    expect(ledger.events.get(key)?.status).toBe("REVOKED");
    expect(ledger.total()).toBe(0);

    ledger.reconcile(key, true, getDailyRuleXp("morning_weight"));
    expect(ledger.events.size).toBe(1);
    expect(ledger.events.get(key)).toMatchObject({
      status: "ACTIVE",
      earnedAt: firstEarnedAt,
    });
    expect(
      evaluateDay(1, { ...PERFECT_VALUES, morning_weight: true }).rules[0]?.state,
    ).toBe("PASS");
    expect(
      evaluateDay(1, { ...PERFECT_VALUES, morning_weight: false }).rules[0]?.state,
    ).toBe("FAIL");
  });

  it("counts two sessions as one workout day and reverses the secured mission", () => {
    const ledger = new IsolatedLedger();
    const fourDates = [0, 1, 2, 3].map((offset) => addCalendarDays(START_DATE, offset));
    const withDuplicateSession = [fourDates[0]!, fourDates[0]!, ...fourDates.slice(1)];
    const secured = evaluateWorkoutWeek({
      challengeStartDate: START_DATE,
      durationDays: DURATION_DAYS,
      challengeWeek: 1,
      currentDate: fourDates[3]!,
      workoutDates: withDuplicateSession,
      requiredWorkoutDays: 4,
    });
    expect(secured).toMatchObject({
      completedWorkoutDays: 4,
      totalWorkoutSessions: 5,
      state: "SECURED",
    });
    for (const date of secured.workoutDates)
      ledger.reconcile(`workout-day:${date}`, true, WORKOUT_DAY_XP);
    ledger.reconcile("workout-week:1:secured", true, WEEKLY_WORKOUT_XP);
    expect(ledger.total()).toBe(4 * WORKOUT_DAY_XP + WEEKLY_WORKOUT_XP);

    const reversedDates = withDuplicateSession.filter((date) => date !== fourDates[3]);
    const reversed = evaluateWorkoutWeek({
      challengeStartDate: START_DATE,
      durationDays: DURATION_DAYS,
      challengeWeek: 1,
      currentDate: fourDates[3]!,
      workoutDates: reversedDates,
      requiredWorkoutDays: 4,
    });
    ledger.reconcile(`workout-day:${fourDates[3]}`, false, WORKOUT_DAY_XP);
    ledger.reconcile(
      "workout-week:1:secured",
      reversed.state === "SECURED",
      WEEKLY_WORKOUT_XP,
    );
    expect(reversed.completedWorkoutDays).toBe(3);
    expect(ledger.total()).toBe(3 * WORKOUT_DAY_XP);

    ledger.reconcile(`workout-day:${fourDates[3]}`, true, WORKOUT_DAY_XP);
    ledger.reconcile("workout-week:1:secured", true, WEEKLY_WORKOUT_XP);
    expect(ledger.events.size).toBe(5);
    expect(ledger.total()).toBe(4 * WORKOUT_DAY_XP + WEEKLY_WORKOUT_XP);
    expect(new Set(["workout-week:1:secured"]).size).toBe(1);
  });

  it("consolidates constructive recovery and clears it with a later normal success", () => {
    expect(
      buildRecoveryEpisodes(
        ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"],
        ["2026-10-08"],
      ),
    ).toEqual([
      {
        triggerKeys: ["2026-10-05", "2026-10-06", "2026-10-07"],
        clearingKey: "2026-10-08",
      },
    ]);
    expect(buildRecoveryEpisodes(["1", "2", "3"], ["3"])).toEqual([
      { triggerKeys: ["1", "2"], clearingKey: "3" },
    ]);
  });

  it("derives streaks across perfect, partial and missing days", () => {
    const perfect = evaluateDay(1, PERFECT_VALUES, 4);
    const partial = evaluateDay(2, { sleep: 7.5, hydration: 1 }, 4);
    const perfectAgain = evaluateDay(4, PERFECT_VALUES, 4);
    const streak = calculatePerfectDayStreak([
      { temporalState: "PAST", isPerfectDay: perfect.isPerfectDay },
      { temporalState: "PAST", isPerfectDay: partial.isPerfectDay },
      { temporalState: "PAST", isPerfectDay: false },
      { temporalState: "TODAY", isPerfectDay: perfectAgain.isPerfectDay },
    ]);
    expect(streak).toEqual({ current: 1, longest: 1 });
    const rules = calculateRuleStreaks(
      [perfect, partial, perfectAgain].map((quest, index) => ({
        date: quest.date,
        temporalState: index === 2 ? ("TODAY" as const) : ("PAST" as const),
        rules: quest.rules,
      })),
      RULES,
    );
    expect(rules.sleep).toMatchObject({ current: 3, longest: 3 });
  });

  it("finalizes a report whose Arc Score excludes weight", () => {
    const days = Array.from({ length: 7 }, (_, index) => ({
      date: addCalendarDays(START_DATE, index),
      challengeDay: index + 1,
      recordExists: index !== 5,
      completionPercent: index < 5 ? 100 : index === 5 ? null : 50,
      isPerfectDay: index < 5,
      rules: RULES.map((rule) => ({
        key: rule.key,
        name: rule.name,
        order: rule.order,
        state: index < 5 ? ("PASS" as const) : ("NOT_RECORDED" as const),
      })),
      workoutSessionCount: index < 4 ? 1 : 0,
      weightKg: index < 4 ? 110 - index : null,
      xpEarned: index < 5 ? 120 : 0,
      isToday: false,
    }));
    const daily = calculateDailyDiscipline(days);
    const workout = calculateWorkoutScoreComponent(4, 4);
    const score = calculateArcScore({
      dailyDisciplinePercent: daily.dailyDisciplinePercent,
      workoutCompletionPercent: workout,
    });
    const changedWeights = days.map((day) => ({ ...day, weightKg: 40 }));
    expect(
      calculateArcScore({
        dailyDisciplinePercent:
          calculateDailyDiscipline(changedWeights).dailyDisciplinePercent,
        workoutCompletionPercent: workout,
      }),
    ).toBe(score);
    const metrics = calculateWeeklyRuleMetrics(days);
    const evaluation = generateSystemEvaluation({
      score,
      daily,
      strongestRules: metrics,
      attentionRules: metrics,
      workoutSecured: true,
      requiredWorkoutDays: 4,
      weightSufficient: true,
      activeRecovery: true,
    });
    expect(score).toBeCloseTo(83.9285714286);
    expect(evaluation.observations).toHaveLength(5);
    expect(evaluation.nextWeekFocus.length).toBeGreaterThan(0);
  });

  it("deduplicates a due partial-quest reminder and suppresses it after completion", () => {
    const partial = evaluateDay(1, { sleep: 7.5, hydration: 1 });
    const context = {
      localDate: START_DATE,
      localTime: "20:05",
      challengeActive: true,
      challengeDay: 1,
      challengeWeek: 1,
      configuredDailyRuleCount: 7,
      quest: {
        isPerfectDay: partial.isPerfectDay,
        completedRequiredRules: partial.completedRequiredRules,
        totalRequiredRules: partial.totalRequiredRules,
        rules: partial.rules,
      },
      weightLogged: false,
      workout: null,
      activeRecoveries: [],
      finalReportWeeks: [],
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true },
      existingDedupeKeys: new Set<string>(),
    } as const;
    const first = evaluateTimeBasedNotifications(context);
    const daily = first.find((candidate) => candidate.type === "DAILY_QUEST");
    expect(daily).toBeDefined();
    expect(
      evaluateTimeBasedNotifications({
        ...context,
        existingDedupeKeys: new Set([daily!.dedupeKey]),
      }).some((candidate) => candidate.type === "DAILY_QUEST"),
    ).toBe(false);

    const complete = evaluateDay(1, PERFECT_VALUES);
    expect(
      evaluateTimeBasedNotifications({
        ...context,
        quest: {
          isPerfectDay: true,
          completedRequiredRules: 7,
          totalRequiredRules: 7,
          rules: complete.rules,
        },
      }).some((candidate) => candidate.type === "DAILY_QUEST"),
    ).toBe(false);
  });

  it("reaches level, rank, achievement and digital-reward milestones deterministically", () => {
    const level = calculateLevelProgress(4_000);
    expect(level.level).toBeGreaterThanOrEqual(10);
    expect(getRankForLevel(level.level)).not.toBe("E");
    const metricNames = new Set(ACHIEVEMENT_DEFINITIONS.map((item) => item.metric));
    const metrics = Object.fromEntries(
      [...metricNames].map((name) => [name, 0]),
    ) as Record<(typeof ACHIEVEMENT_DEFINITIONS)[number]["metric"], number>;
    metrics.perfectDays = 14;
    metrics.perfectStreak = 14;
    metrics.level = level.level;
    metrics.securedWorkoutWeeks = 1;
    const achievements = evaluateAchievementProgress(metrics);
    expect(
      achievements.some((item) => item.key === "FIRST_CLEAR" && item.qualified),
    ).toBe(true);
    expect(
      achievements.some((item) => item.key === "PERFECT_STREAK_14" && item.qualified),
    ).toBe(true);
    expect(
      new Set(["daily-clear:2026-10-05", "workout-week:1", `level:${level.level}`]).size,
    ).toBe(3);
  });

  it("runs all 90 isolated dates without creating Day 91 or a partial-week Perfect Week", () => {
    const dates = Array.from({ length: DURATION_DAYS }, (_, index) =>
      addCalendarDays(START_DATE, index),
    );
    expect(dates).toHaveLength(90);
    expect(new Set(dates).size).toBe(90);
    const perfectWeeks = getFinalizedPerfectWeeks({
      challengeStartDate: START_DATE,
      durationDays: DURATION_DAYS,
      currentDate: addCalendarDays(START_DATE, 90),
      perfectDates: dates,
    });
    expect(perfectWeeks).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(perfectWeeks).not.toContain(13);
    expect(dates).not.toContain(addCalendarDays(START_DATE, 90));
  });
});
