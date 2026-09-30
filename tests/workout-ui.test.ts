import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkoutTracker } from "@/components/workouts/workout-tracker";

const session = {
  id: "workout-1",
  date: "2026-09-30",
  timezone: "Asia/Kolkata",
  challengeDay: 1,
  challengeWeek: 1,
  type: "STRENGTH" as const,
  title: "Push Day",
  durationMinutes: 65,
  notes: "Strong session",
  startedAt: null,
  completedAt: "2026-09-30T06:00:00.000Z",
  status: "COMPLETED" as const,
  createdAt: "2026-09-30T06:00:00.000Z",
  updatedAt: "2026-09-30T06:00:00.000Z",
};

function dashboard(state: "NOT_STARTED" | "CRITICAL" | "SECURED" = "NOT_STARTED") {
  const completed = state === "SECURED" ? 4 : state === "CRITICAL" ? 3 : 0;
  const remaining = 4 - completed;
  return {
    kind: "AVAILABLE" as const,
    timezone: "Asia/Kolkata",
    localDate: "2026-09-30",
    challengeDay: 1,
    durationDays: 90,
    todaySessions: state === "SECURED" ? [session] : [],
    week: {
      challengeWeek: 1,
      weekStartDate: "2026-09-30",
      weekEndDate: "2026-10-06",
      completedWorkoutDays: completed,
      totalWorkoutSessions: state === "SECURED" ? 5 : completed,
      requiredWorkoutDays: 4,
      workoutsRemaining: remaining,
      daysRemaining: state === "CRITICAL" ? 1 : 7,
      availableWorkoutDays: state === "CRITICAL" ? 1 : 7,
      rawCompletionPercent: completed * 25,
      completionPercent: completed * 25,
      requiredRate: state === "CRITICAL" ? 1 : remaining / 7,
      state,
      isWeekFinalized: false,
      workoutDates: [],
    },
    timeline: [
      {
        date: "2026-09-30",
        challengeDay: 1,
        dayInChallengeWeek: 1,
        sessionCount: state === "SECURED" ? 2 : 0,
        hasWorkout: state === "SECURED",
        temporalState: "TODAY" as const,
      },
    ],
    weekSessions: state === "SECURED" ? [session] : [],
    streak: { current: state === "SECURED" ? 1 : 0, longest: 2 },
  };
}

describe("workout UI", () => {
  it("keeps the weekly mission separate and exposes a mobile-friendly log action", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkoutTracker, { initialResult: dashboard() }),
    );
    expect(markup).toContain("WORKOUT PROTOCOL");
    expect(markup).toContain("LOG WORKOUT");
    expect(markup).toContain("0 / 4");
    expect(markup).not.toContain("DAILY QUEST COMPLETE");
  });

  it("renders the exact critical no-rest warning", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkoutTracker, { initialResult: dashboard("CRITICAL") }),
    );
    expect(markup).toContain("NO REST DAYS REMAIN");
    expect(markup).toContain("1 WORKOUTS / 1 DAYS");
  });

  it("renders secured sessions, timeline and streaks on the workout page", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkoutTracker, {
        initialResult: dashboard("SECURED"),
        full: true,
      }),
    );
    expect(markup).toContain("WEEKLY MISSION COMPLETE");
    expect(markup).toContain("Push Day");
    expect(markup).toContain("65 MIN");
    expect(markup).toContain("2 SESSIONS");
    expect(markup).toContain("LONGEST 2");
  });

  it("shows honest unavailable setup state", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkoutTracker, {
        initialResult: { kind: "UNAVAILABLE", reason: "PROFILE_REQUIRED" },
      }),
    );
    expect(markup).toContain("COMPLETE OWNER PROFILE SETUP");
  });
});
