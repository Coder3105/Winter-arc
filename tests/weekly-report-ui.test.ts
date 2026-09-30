import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReportList } from "@/components/reports/report-list";
import { WeeklyReportDetail } from "@/components/reports/weekly-report-detail";
import type { WeeklyReportSnapshot } from "@/server/services/weekly-report-service";

const report = {
  reportPolicyVersion: 1,
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
    dailyDisciplinePercent: 95,
    perfectDayRate: 600 / 7,
    allAvailableDaysCleared: false,
    perfectWeek: false,
  },
  rules: [
    {
      key: "sleep",
      name: "Sleep",
      order: 1,
      passed: 6,
      failed: 0,
      notRecorded: 1,
      notApplicable: 0,
      eligible: 7,
      compliancePercent: 600 / 7,
    },
  ],
  strongestRules: [],
  attentionRules: [],
  workout: {
    requiredWorkoutDays: 4,
    completedWorkoutDays: 4,
    totalWorkoutSessions: 5,
    workoutDates: ["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-06"],
    missionState: "SECURED",
    secured: true,
    workoutsRemaining: null,
    daysRemaining: null,
    completionPercent: 100,
    weeklyStreak: 1,
    longestWeeklyStreak: 1,
  },
  weight: {
    firstWeightKg: 111.1,
    firstWeightDate: "2026-10-01",
    lastWeightKg: 110.4,
    lastWeightDate: "2026-10-07",
    deltaKg: -0.7,
    deltaPercent: -0.63,
    averageWeightKg: 110.7,
    measurementCount: 5,
    isSufficientData: true,
    previousAverageWeightKg: null,
    averageDeltaKg: null,
  },
  bodyComposition: [],
  progression: {
    xpEarned: 500,
    dailyRulesXp: 300,
    perfectDayXp: 150,
    workoutDayXp: 120,
    weeklyMissionXp: 100,
    startingLevel: 1,
    endingLevel: 4,
    startingRank: "E",
    endingRank: "E",
    levelsGained: 3,
  },
  achievements: [],
  rewards: { count: 1, items: [] },
  recovery: {
    dailyAssigned: 0,
    workoutAssigned: 0,
    dailyCompleted: 0,
    workoutCompleted: 0,
    active: false,
  },
  dailyBreakdown: [
    {
      date: "2026-10-01",
      challengeDay: 1,
      calendarState: "PERFECT",
      recordExists: true,
      completionPercent: 100,
      isPerfectDay: true,
      workoutSessionCount: 1,
      weightKg: 111.1,
      xpEarned: 150,
    },
  ],
  arcScore: { value: 96.25, policyVersion: 1, isProvisional: false },
  systemEvaluation: {
    label: "EXCEPTIONAL",
    observations: ["6 of 7 elapsed challenge days were Perfect."],
    nextWeekFocus: ["Maintain Sleep consistency."],
  },
  comparison: {
    previousArcScore: null,
    arcScoreDelta: null,
    dailyDisciplineDelta: null,
    perfectDaysDelta: null,
    workoutDaysDelta: null,
    xpDelta: null,
    weightAverageDelta: null,
  },
} satisfies WeeklyReportSnapshot;

describe("Phase 10 report UI", () => {
  it("renders the complete report with the gamification boundary", () => {
    const markup = renderToStaticMarkup(createElement(WeeklyReportDetail, { report }));
    expect(markup).toContain("ARC SCORE");
    expect(markup).toContain("96.3");
    expect(markup).toContain("EXCEPTIONAL");
    expect(markup).toContain("DAILY DISCIPLINE");
    expect(markup).toContain("WORKOUT MISSION");
    expect(markup).toContain("GAMIFIED CONSISTENCY ONLY");
    expect(markup).toContain("NEXT AVAILABLE WEEK");
  });

  it("renders finalized and live-preview list summaries", () => {
    const markup = renderToStaticMarkup(
      createElement(ReportList, {
        result: {
          kind: "AVAILABLE",
          current: {
            challengeWeek: 2,
            weekStartDate: "2026-10-08",
            weekEndDate: "2026-10-14",
            status: "PREVIEW",
            arcScore: 75,
            evaluation: "STRONG",
            perfectDays: 1,
            elapsedDays: 2,
            workoutDays: 1,
            requiredWorkoutDays: 4,
            xpEarned: 120,
          },
          finalized: [
            {
              challengeWeek: 1,
              weekStartDate: "2026-10-01",
              weekEndDate: "2026-10-07",
              status: "FINAL",
              arcScore: 96.25,
              evaluation: "EXCEPTIONAL",
              perfectDays: 6,
              elapsedDays: 7,
              workoutDays: 4,
              requiredWorkoutDays: 4,
              xpEarned: 500,
            },
          ],
        },
      }),
    );
    expect(markup).toContain("CURRENT WEEK // LIVE PREVIEW");
    expect(markup).toContain("FINAL REPORT");
    expect(markup).toContain("WEEK 02");
  });

  it("shows an explicit unavailable state", () => {
    const markup = renderToStaticMarkup(
      createElement(ReportList, {
        result: { kind: "UNAVAILABLE", reason: "PROFILE_REQUIRED" },
      }),
    );
    expect(markup).toContain("PROFILE REQUIRED");
  });
});
