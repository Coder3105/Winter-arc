import { addCalendarDays, calendarDayIndex } from "../common/calendar";
import { CalculationError, integer } from "../common/validation";
import { weeklyCompletionPercent } from "../challenge/compliance";

export const WORKOUT_WEEK_STATES = [
  "NOT_STARTED",
  "ON_TRACK",
  "AT_RISK",
  "CRITICAL",
  "SECURED",
  "FAILED",
] as const;

export type WorkoutWeekState = (typeof WORKOUT_WEEK_STATES)[number];

export interface WorkoutWeekSummary {
  readonly challengeWeek: number;
  readonly weekStartDate: string;
  readonly weekEndDate: string;
  readonly completedWorkoutDays: number;
  readonly totalWorkoutSessions: number;
  readonly requiredWorkoutDays: number;
  readonly workoutsRemaining: number;
  readonly daysRemaining: number;
  readonly availableWorkoutDays: number;
  readonly rawCompletionPercent: number | null;
  readonly completionPercent: number | null;
  readonly requiredRate: number;
  readonly state: WorkoutWeekState;
  readonly isWeekFinalized: boolean;
  readonly workoutDates: readonly string[];
}

export function getChallengeWeekBounds({
  challengeStartDate,
  durationDays,
  challengeWeek,
}: {
  readonly challengeStartDate: string;
  readonly durationDays: number;
  readonly challengeWeek: number;
}) {
  integer(durationDays, "durationDays", 1);
  integer(challengeWeek, "challengeWeek", 1);
  calendarDayIndex(challengeStartDate);
  const weekCount = Math.ceil(durationDays / 7);
  if (challengeWeek > weekCount) {
    throw new CalculationError("challengeWeek", "must be within the challenge.");
  }
  const startChallengeDay = (challengeWeek - 1) * 7 + 1;
  const endChallengeDay = Math.min(challengeWeek * 7, durationDays);
  return {
    challengeWeek,
    startChallengeDay,
    endChallengeDay,
    weekLengthDays: endChallengeDay - startChallengeDay + 1,
    weekStartDate: addCalendarDays(challengeStartDate, startChallengeDay - 1),
    weekEndDate: addCalendarDays(challengeStartDate, endChallengeDay - 1),
  } as const;
}

export function evaluateWorkoutWeek({
  challengeStartDate,
  durationDays,
  challengeWeek,
  currentDate,
  workoutDates,
  requiredWorkoutDays,
}: {
  readonly challengeStartDate: string;
  readonly durationDays: number;
  readonly challengeWeek: number;
  readonly currentDate: string;
  readonly workoutDates: readonly string[];
  readonly requiredWorkoutDays: number;
}): WorkoutWeekSummary {
  integer(requiredWorkoutDays, "requiredWorkoutDays", 1);
  if (requiredWorkoutDays > 7) {
    throw new CalculationError("requiredWorkoutDays", "must be at most 7.");
  }
  const bounds = getChallengeWeekBounds({
    challengeStartDate,
    durationDays,
    challengeWeek,
  });
  const currentIndex = calendarDayIndex(currentDate);
  const startIndex = calendarDayIndex(bounds.weekStartDate);
  const endIndex = calendarDayIndex(bounds.weekEndDate);
  const weekSessions = workoutDates.filter((date) => {
    const index = calendarDayIndex(date);
    return index >= startIndex && index <= endIndex;
  });
  const distinctDates = [...new Set(weekSessions)].sort();
  const completedWorkoutDays = distinctDates.length;
  const workoutsRemaining = Math.max(requiredWorkoutDays - completedWorkoutDays, 0);
  const isWeekFinalized = currentIndex > endIndex;
  const daysRemaining =
    currentIndex < startIndex
      ? bounds.weekLengthDays
      : isWeekFinalized
        ? 0
        : endIndex - currentIndex + 1;
  const completion = weeklyCompletionPercent(completedWorkoutDays, requiredWorkoutDays);
  const requiredRate =
    daysRemaining === 0
      ? workoutsRemaining > 0
        ? Infinity
        : 0
      : workoutsRemaining / daysRemaining;
  let state: WorkoutWeekState;
  if (workoutsRemaining === 0) state = "SECURED";
  else if (isWeekFinalized || workoutsRemaining > daysRemaining) state = "FAILED";
  else if (workoutsRemaining === daysRemaining) state = "CRITICAL";
  else if (completedWorkoutDays === 0) state = "NOT_STARTED";
  else if (requiredRate <= 0.5) state = "ON_TRACK";
  else state = "AT_RISK";

  return {
    challengeWeek,
    weekStartDate: bounds.weekStartDate,
    weekEndDate: bounds.weekEndDate,
    completedWorkoutDays,
    totalWorkoutSessions: weekSessions.length,
    requiredWorkoutDays,
    workoutsRemaining,
    daysRemaining,
    availableWorkoutDays: daysRemaining,
    rawCompletionPercent: completion.rawPercent,
    completionPercent: completion.clampedPercent,
    requiredRate,
    state,
    isWeekFinalized,
    workoutDates: distinctDates,
  };
}
