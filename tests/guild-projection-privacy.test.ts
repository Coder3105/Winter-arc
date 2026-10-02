import { describe, expect, it } from "vitest";

import { DEFAULT_GUILD_SHARING } from "@/lib/guild/sharing";
import {
  projectGuildReport,
  ruleMayBeShared,
} from "@/server/services/guild-projection-service";
import type { WeeklyReportSnapshot } from "@/server/services/weekly-report-service";

const publicRule = {
  key: "sleep",
  name: "SLEEP",
  order: 1,
  passed: 6,
  failed: 1,
  notRecorded: 0,
  notApplicable: 0,
  eligible: 7,
  compliancePercent: 85.7,
};
const privateRule = {
  ...publicRule,
  key: "no_fap",
  name: "NO FAP",
  order: 2,
  passed: 7,
  failed: 0,
  compliancePercent: 100,
};

const report = {
  status: "FINAL",
  generatedAt: "2026-10-08T00:00:00.000Z",
  period: {
    challengeWeek: 1,
    weekStartDate: "2026-10-01",
    weekEndDate: "2026-10-07",
    challengeDayStart: 1,
    challengeDayEnd: 7,
    availableDays: 7,
    nextAvailableWeek: 2,
  },
  dailyQuest: {
    elapsedDays: 7,
    recordedDays: 7,
    missedDays: 0,
    partialDays: 1,
    perfectDays: 6,
    dailyDisciplinePercent: 90,
    perfectDayRate: 85.7,
    allAvailableDaysCleared: false,
    perfectWeek: false,
  },
  rules: [publicRule, privateRule],
  strongestRules: [privateRule],
  attentionRules: [publicRule],
  workout: {
    requiredWorkoutDays: 4,
    completedWorkoutDays: 4,
    totalWorkoutSessions: 5,
    workoutDates: ["2026-10-01"],
    missionState: "SECURED",
    secured: true,
    workoutsRemaining: 0,
    daysRemaining: 0,
    completionPercent: 100,
    weeklyStreak: 1,
    longestWeeklyStreak: 1,
  },
  progression: {
    xpEarned: 500,
    dailyRulesXp: 200,
    perfectDayXp: 100,
    workoutDayXp: 100,
    weeklyMissionXp: 100,
    startingLevel: 1,
    endingLevel: 3,
    startingRank: "E",
    endingRank: "E",
    levelsGained: 2,
  },
  weight: {
    firstWeightKg: 70.5,
    firstWeightDate: "2026-10-01",
    lastWeightKg: 69.8,
    lastWeightDate: "2026-10-07",
    deltaKg: -0.7,
    deltaPercent: -0.99,
    averageWeightKg: 70.1,
    measurementCount: 7,
    isSufficientData: true,
    previousAverageWeightKg: null,
    averageDeltaKg: null,
  },
  bodyComposition: [
    {
      assessmentDate: "2026-10-07",
      weightKg: 69.8,
      percentBodyFat: 18.2,
      skeletalMuscleMassKg: 31.4,
    },
  ],
  dailyBreakdown: [
    {
      date: "2026-10-01",
      challengeDay: 1,
      calendarState: "PERFECT",
      recordExists: true,
      completionPercent: 100,
      isPerfectDay: true,
      workoutSessionCount: 1,
      weightKg: 70.5,
      xpEarned: 120,
    },
  ],
  arcScore: { value: 92.5, policyVersion: 1, isProvisional: false },
  systemEvaluation: {
    label: "EXCEPTIONAL",
    observations: ["NO FAP had the highest recorded rule compliance."],
    nextWeekFocus: ["Private recovery detail"],
  },
  recovery: { active: true, privateTrigger: "no_fap" },
} as unknown as WeeklyReportSnapshot;

describe("V2.4 friend-safe report projection", () => {
  it("treats unknown rules as private and catalogue private rules as opt-in", () => {
    expect(ruleMayBeShared("sleep", false)).toBe(true);
    expect(ruleMayBeShared("no_fap", false)).toBe(false);
    expect(ruleMayBeShared("no_fap", true)).toBe(true);
    expect(ruleMayBeShared("future_unknown_rule", true)).toBe(false);
  });

  it("omits private habits, weight, body composition, and recovery by default", () => {
    const projection = projectGuildReport(report, { ...DEFAULT_GUILD_SHARING });
    const serialized = JSON.stringify(projection);
    expect(projection.rules.map((rule) => rule.key)).toEqual(["sleep"]);
    expect(serialized).not.toMatch(/no_fap|NO FAP/i);
    expect(projection).not.toHaveProperty("weight");
    expect(projection).not.toHaveProperty("bodyComposition");
    expect(projection).not.toHaveProperty("recovery");
    expect(serialized).not.toContain("70.5");
    expect(serialized).not.toContain("Private recovery detail");
  });

  it("includes only explicitly enabled sensitive sections", () => {
    const projection = projectGuildReport(report, {
      ...DEFAULT_GUILD_SHARING,
      sharePrivateHabits: true,
      shareWeight: true,
      shareBodyComposition: true,
    });
    expect(projection.rules.map((rule) => rule.key)).toEqual(["sleep", "no_fap"]);
    expect(projection).toHaveProperty("weight.averageWeightKg", 70.1);
    expect(projection).toHaveProperty("bodyComposition.0.percentBodyFat", 18.2);
    expect(projection).not.toHaveProperty("recovery");
  });
});
