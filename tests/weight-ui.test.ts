import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProgressDashboard } from "@/components/progress/progress-dashboard";
import { TodayTracker } from "@/components/daily-quest/today-tracker";
import { buildWeightAnalytics } from "@/server/calculations";

const quest = {
  id: "quest-1",
  date: "2026-09-30",
  timezone: "UTC",
  challengeDay: 1,
  challengeWeek: 1,
  durationDays: 90,
  status: "NOT_STARTED" as const,
  completedRequiredRules: 0,
  totalRequiredRules: 2,
  rawCompletionPercent: 0,
  completionPercent: 0,
  isPerfectDay: false,
  rules: [
    {
      key: "morning_weight",
      name: "Log Morning Weight",
      type: "LOGGING_REQUIREMENT" as const,
      target: null,
      unit: null,
      requiredFrequency: 7,
      order: 1,
      actual: null,
      passed: null,
      state: "NOT_RECORDED" as const,
      rawPercent: null,
      rawCompletionPercent: null,
      completionPercent: null,
    },
    {
      key: "no_junk_food",
      name: "No Junk Food",
      type: "BOOLEAN" as const,
      target: null,
      unit: null,
      requiredFrequency: 7,
      order: 2,
      actual: null,
      passed: null,
      state: "NOT_RECORDED" as const,
      rawPercent: null,
      rawCompletionPercent: null,
      completionPercent: null,
    },
  ],
  completedAt: null,
  createdAt: "2026-09-30T00:00:00Z",
  updatedAt: "2026-09-30T00:00:00Z",
};

const baseline = {
  id: "baseline",
  source: "InBody120",
  assessmentDate: "2026-08-14T19:11:00Z",
  isBaseline: true,
  measurements: {
    weightKg: 111.1,
    percentBodyFat: 45.3,
    bodyFatMassKg: 50.4,
    fatFreeMassKg: 60.7,
    skeletalMuscleMassKg: 34.3,
    visceralFatLevel: 25,
    waistHipRatio: 1.02,
  },
};

describe("weight and progress UI", () => {
  it("replaces the manual Morning Weight binary control with canonical weight input", () => {
    const markup = renderToStaticMarkup(
      createElement(TodayTracker, {
        initialResult: { kind: "AVAILABLE", quest },
        initialWeightResult: {
          kind: "AVAILABLE",
          localDate: "2026-09-30",
          weight: null,
        },
      }),
    );
    expect(markup).toContain("MORNING WEIGHT");
    expect(markup).toContain("LOG WEIGHT");
    expect(markup).toContain('step="0.01"');
    expect(markup).not.toContain("NOT LOGGED");
    expect(markup).toContain("No Junk Food");
  });

  it("renders a logged editable weight and remove action", () => {
    const markup = renderToStaticMarkup(
      createElement(TodayTracker, {
        initialResult: { kind: "AVAILABLE", quest },
        initialWeightResult: {
          kind: "AVAILABLE",
          localDate: "2026-09-30",
          weight: {
            id: "weight-1",
            date: "2026-09-30",
            timezone: "UTC",
            challengeDay: 1,
            challengeWeek: 1,
            weightKg: 108.6,
            source: "MANUAL",
            recordedAt: "2026-09-30T06:00:00Z",
            createdAt: "2026-09-30T06:00:00Z",
            updatedAt: "2026-09-30T06:00:00Z",
          },
        },
      }),
    );
    expect(markup).toContain("108.6 KG");
    expect(markup).toContain("UPDATE");
    expect(markup).toContain("REMOVE");
    expect(markup).toContain("PASS");
  });

  it("renders transformation metrics, graph filters, goal and measured composition", () => {
    const projection = buildWeightAnalytics({
      timezone: "UTC",
      currentDate: "2026-09-30",
      targetWeightKg: 90,
      records: Array.from({ length: 8 }, (_, index) => ({
        date: `2026-09-${String(index + 23).padStart(2, "0")}`,
        weightKg: 109 - index * 0.2,
        recordedAt: "2026-09-30T06:00:00Z",
        source: "MANUAL" as const,
      })),
      baseline,
      latestAssessment: baseline,
      assessments: [baseline],
    });
    const analytics = {
      kind: "AVAILABLE" as const,
      challenge: { status: "ACTIVE" as const, dayNumber: 1, durationDays: 90 },
      ...projection,
    };
    const markup = renderToStaticMarkup(createElement(ProgressDashboard, { analytics }));
    expect(markup).toContain("CURRENT WEIGHT");
    expect(markup).toContain("STARTING WEIGHT");
    expect(markup).toContain("TOTAL CHANGE");
    expect(markup).toContain("7-DAY AVERAGE");
    expect(markup).toContain("WEEKLY CHANGE");
    expect(markup).toContain("GOAL PROGRESS");
    expect(markup).toContain(">7D<");
    expect(markup).toContain(">30D<");
    expect(markup).toContain(">90D<");
    expect(markup).toContain(">ALL<");
    expect(markup).toContain("BODY COMPOSITION");
    expect(markup).toContain("INBODY120");
    expect(markup).toContain("NEXT BODY-COMPOSITION ASSESSMENT REQUIRED");
  });
});
