import { describe, expect, it } from "vitest";

import {
  calculateArcScore,
  calculateDailyDiscipline,
  calculateWeeklyRuleMetrics,
  calculateWorkoutScoreComponent,
  compareWeeklyReports,
  generateSystemEvaluation,
  getSystemEvaluationLabel,
  rankWeeklyRules,
  type ReportDayInput,
} from "@/server/calculations";

function day(
  date: string,
  completionPercent: number,
  perfect = completionPercent === 100,
): ReportDayInput {
  return {
    date,
    challengeDay: Number(date.slice(-2)),
    recordExists: true,
    completionPercent,
    isPerfectDay: perfect,
    rules: [],
    workoutSessionCount: 0,
    weightKg: null,
    xpEarned: 0,
    isToday: false,
  };
}

describe("Phase 10 weekly report calculations", () => {
  it("weights Daily Discipline at 75% and workouts at 25%", () => {
    expect(
      calculateArcScore({
        dailyDisciplinePercent: 100,
        workoutCompletionPercent: 100,
      }),
    ).toBe(100);
    expect(
      calculateArcScore({
        dailyDisciplinePercent: 100,
        workoutCompletionPercent: 75,
      }),
    ).toBe(93.75);
    expect(
      calculateArcScore({
        dailyDisciplinePercent: 80,
        workoutCompletionPercent: 100,
      }),
    ).toBe(85);
    expect(
      calculateArcScore({
        dailyDisciplinePercent: 80,
        workoutCompletionPercent: 50,
      }),
    ).toBe(72.5);
    expect(
      calculateArcScore({
        dailyDisciplinePercent: 0,
        workoutCompletionPercent: 0,
      }),
    ).toBe(0);
    expect(
      calculateArcScore({
        dailyDisciplinePercent: null,
        workoutCompletionPercent: 100,
      }),
    ).toBeNull();
  });

  it("caps workout overachievement and rejects invalid score inputs", () => {
    expect(calculateWorkoutScoreComponent(5, 4)).toBe(100);
    expect(calculateWorkoutScoreComponent(3, 4)).toBe(75);
    expect(() => calculateWorkoutScoreComponent(-1, 4)).toThrow();
    expect(() =>
      calculateArcScore({
        dailyDisciplinePercent: 101,
        workoutCompletionPercent: 100,
      }),
    ).toThrow();
  });

  it.each([
    [0, "INCOMPLETE"],
    [59.999, "INCOMPLETE"],
    [60, "STEADY"],
    [74.999, "STEADY"],
    [75, "STRONG"],
    [89.999, "STRONG"],
    [90, "EXCEPTIONAL"],
    [100, "EXCEPTIONAL"],
  ] as const)("maps score %s to %s", (score, label) => {
    expect(getSystemEvaluationLabel(score)).toBe(label);
  });

  it("treats a missing elapsed day as zero without inventing a record", () => {
    const days = [
      ...Array.from({ length: 6 }, (_, index) => day(`2026-10-0${index + 1}`, 100)),
      { ...day("2026-10-07", 0, false), recordExists: false },
    ];
    expect(calculateDailyDiscipline(days)).toMatchObject({
      elapsedDays: 7,
      recordedDays: 6,
      missedDays: 1,
      perfectDays: 6,
      dailyDisciplinePercent: 600 / 7,
    });
  });

  it("uses only supplied elapsed days for previews and supports six-day Week 13", () => {
    expect(calculateDailyDiscipline([day("2026-10-01", 50)])).toMatchObject({
      elapsedDays: 1,
      dailyDisciplinePercent: 50,
    });
    expect(
      calculateDailyDiscipline(
        Array.from({ length: 6 }, (_, index) => day(`2026-12-${25 + index}`, 100)),
      ),
    ).toMatchObject({ elapsedDays: 6, perfectDays: 6, perfectDayRate: 100 });
    expect(calculateDailyDiscipline([]).dailyDisciplinePercent).toBeNull();
  });

  it("calculates rules only from actual snapshots and preserves ties", () => {
    const days: ReportDayInput[] = [
      {
        ...day("2026-10-01", 100),
        rules: [
          { key: "sleep", name: "Sleep", order: 1, state: "PASS" },
          { key: "steps", name: "Steps", order: 2, state: "FAIL" },
        ],
      },
      {
        ...day("2026-10-02", 50, false),
        rules: [
          { key: "sleep", name: "Sleep", order: 1, state: "NOT_RECORDED" },
          { key: "steps", name: "Steps", order: 2, state: "PASS" },
          { key: "new", name: "New Rule", order: 3, state: "NOT_APPLICABLE" },
        ],
      },
      { ...day("2026-10-03", 0, false), recordExists: false },
    ];
    const metrics = calculateWeeklyRuleMetrics(days);
    expect(metrics).toEqual([
      expect.objectContaining({ key: "sleep", eligible: 2, compliancePercent: 50 }),
      expect.objectContaining({ key: "steps", eligible: 2, compliancePercent: 50 }),
      expect.objectContaining({ key: "new", eligible: 0, compliancePercent: null }),
    ]);
    const ranked = rankWeeklyRules(metrics);
    expect(ranked.strongestRules.map(({ key }) => key)).toEqual(["sleep", "steps"]);
    expect(ranked.attentionRules.map(({ key }) => key)).toEqual(["sleep", "steps"]);
  });

  it("returns null Week 1 comparisons and signed later-week deltas", () => {
    const current = {
      arcScore: 80,
      dailyDisciplinePercent: 75,
      perfectDays: 4,
      workoutDays: 4,
      xpEarned: 300,
      averageWeightKg: 108,
    };
    expect(compareWeeklyReports(current, null).arcScoreDelta).toBeNull();
    expect(
      compareWeeklyReports(current, {
        arcScore: 70,
        dailyDisciplinePercent: 80,
        perfectDays: 5,
        workoutDays: 3,
        xpEarned: 250,
        averageWeightKg: 109,
      }),
    ).toMatchObject({
      arcScoreDelta: 10,
      dailyDisciplineDelta: -5,
      perfectDaysDelta: -1,
      workoutDaysDelta: 1,
      xpDelta: 50,
      weightAverageDelta: -1,
    });
  });

  it("generates deterministic factual observations and constructive focus", () => {
    const daily = calculateDailyDiscipline([day("2026-10-01", 100)]);
    const result = generateSystemEvaluation({
      score: 100,
      daily,
      strongestRules: [{ name: "Sleep" }],
      attentionRules: [{ name: "Steps" }],
      workoutSecured: true,
      requiredWorkoutDays: 4,
      weightSufficient: false,
      activeRecovery: true,
    });
    expect(result.label).toBe("EXCEPTIONAL");
    expect(result.observations.join(" ")).toContain("1 of 1");
    expect(result.nextWeekFocus).toEqual([
      "Improve consistency on Steps.",
      "Complete the configured 4 training days.",
      "Clear active Recovery Protocols using their normal requirement.",
    ]);
    expect(result.observations.join(" ")).not.toMatch(/punish|starv|dehydrat/i);
  });
});
