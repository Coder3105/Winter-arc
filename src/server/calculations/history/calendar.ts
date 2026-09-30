import { parseCalendarDate } from "@/lib/utils/calendar-date";

import {
  addCalendarDays,
  calendarDayIndex,
  normalizeCalendarDate,
} from "../common/calendar";
import { CalculationError, integer } from "../common/validation";
import { challengeDayToWeek } from "../challenge/challenge-date";

export const CALENDAR_STATES = [
  "PERFECT",
  "PARTIAL",
  "MISSED",
  "TODAY_PENDING",
  "FUTURE",
  "OUTSIDE_CHALLENGE",
] as const;

export type CalendarState = (typeof CALENDAR_STATES)[number];
export type QuestStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "MISSED";

export interface CalendarQuestSnapshot {
  readonly date: string;
  readonly status: QuestStatus;
  readonly isPerfectDay: boolean;
  readonly completionPercent: number | null;
  readonly completedRequiredRules: number;
  readonly totalRequiredRules: number;
}

export interface CalendarDaySummary {
  readonly date: string;
  readonly challengeDay: number | null;
  readonly challengeWeek: number | null;
  readonly relation: "BEFORE_CHALLENGE" | "CHALLENGE_DAY" | "AFTER_CHALLENGE";
  readonly temporalState: "PAST" | "TODAY" | "FUTURE";
  readonly recordExists: boolean;
  readonly questStatus: QuestStatus | null;
  readonly isPerfectDay: boolean;
  readonly completionPercent: number | null;
  readonly calendarState: CalendarState;
  readonly passedRules: number;
  readonly totalRequiredRules: number;
  readonly hasWorkout: boolean;
  readonly workoutSessionCount: number;
  readonly hasWeight: boolean;
  readonly weightKg: number | null;
}

export interface CalendarMonthRange {
  readonly month: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly dayCount: number;
  readonly leadingMondaySlots: number;
}

export function getCalendarMonthRange(month: string): CalendarMonthRange {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new CalculationError("month", "must use strict YYYY-MM format.");
  }
  const startDate = `${month}-01`;
  let parsed: Date;
  try {
    parsed = parseCalendarDate(startDate);
  } catch {
    throw new CalculationError("month", "must identify a valid calendar month.");
  }
  const year = parsed.getUTCFullYear();
  const monthNumber = parsed.getUTCMonth();
  const nextMonth = new Date(0);
  nextMonth.setUTCFullYear(year, monthNumber + 1, 1);
  const dayCount = Math.round((nextMonth.getTime() - parsed.getTime()) / 86_400_000);
  return {
    month,
    startDate,
    endDate: addCalendarDays(startDate, dayCount - 1),
    dayCount,
    leadingMondaySlots: (parsed.getUTCDay() + 6) % 7,
  };
}

export function summarizeCalendarDay({
  date,
  currentDate,
  startDate,
  durationDays,
  quest,
  workoutSessionCount,
  weightKg,
}: {
  readonly date: string;
  readonly currentDate: string;
  readonly startDate: string;
  readonly durationDays: number;
  readonly quest?: CalendarQuestSnapshot;
  readonly workoutSessionCount?: number;
  readonly weightKg?: number;
}): CalendarDaySummary {
  integer(durationDays, "durationDays", 1);
  const index = calendarDayIndex(date);
  const currentIndex = calendarDayIndex(currentDate);
  const startIndex = calendarDayIndex(startDate);
  const challengeOffset = index - startIndex;
  const challengeDay =
    challengeOffset >= 0 && challengeOffset < durationDays ? challengeOffset + 1 : null;
  const relation =
    challengeDay !== null
      ? "CHALLENGE_DAY"
      : challengeOffset < 0
        ? "BEFORE_CHALLENGE"
        : "AFTER_CHALLENGE";
  const temporalState =
    index < currentIndex ? "PAST" : index === currentIndex ? "TODAY" : "FUTURE";
  const recordExists = quest !== undefined;
  const isPerfectDay = Boolean(quest?.isPerfectDay && quest.status === "COMPLETE");
  let calendarState: CalendarState;
  if (relation !== "CHALLENGE_DAY") calendarState = "OUTSIDE_CHALLENGE";
  else if (temporalState === "FUTURE") calendarState = "FUTURE";
  else if (isPerfectDay) calendarState = "PERFECT";
  else if (temporalState === "TODAY") calendarState = "TODAY_PENDING";
  else calendarState = recordExists ? "PARTIAL" : "MISSED";

  return {
    date,
    challengeDay,
    challengeWeek:
      challengeDay === null
        ? null
        : challengeDayToWeek(challengeDay, durationDays).weekNumber,
    relation,
    temporalState,
    recordExists,
    questStatus:
      quest?.status ??
      (relation === "CHALLENGE_DAY" && temporalState === "PAST" ? "MISSED" : null),
    isPerfectDay,
    completionPercent: quest?.completionPercent ?? null,
    calendarState,
    passedRules: quest?.completedRequiredRules ?? 0,
    totalRequiredRules: quest?.totalRequiredRules ?? 0,
    hasWorkout: (workoutSessionCount ?? 0) > 0,
    workoutSessionCount: workoutSessionCount ?? 0,
    hasWeight: weightKg !== undefined,
    weightKg: weightKg ?? null,
  };
}

export function aggregateCalendarMonth({
  month,
  timezone,
  startDate,
  durationDays,
  currentInstant,
  quests,
  workoutDates,
  weights,
}: {
  readonly month: string;
  readonly timezone: string;
  readonly startDate: string;
  readonly durationDays: number;
  readonly currentInstant: string | Date;
  readonly quests: readonly CalendarQuestSnapshot[];
  readonly workoutDates?: readonly string[];
  readonly weights?: readonly { readonly date: string; readonly weightKg: number }[];
}) {
  const range = getCalendarMonthRange(month);
  const currentDate = normalizeCalendarDate(currentInstant, timezone);
  const questByDate = new Map(quests.map((quest) => [quest.date, quest]));
  const workoutCountByDate = new Map<string, number>();
  for (const date of workoutDates ?? []) {
    calendarDayIndex(date);
    workoutCountByDate.set(date, (workoutCountByDate.get(date) ?? 0) + 1);
  }
  const weightByDate = new Map<string, number>();
  for (const weight of weights ?? []) {
    calendarDayIndex(weight.date);
    if (!Number.isFinite(weight.weightKg) || weight.weightKg <= 0)
      throw new CalculationError("weightKg", "must be finite and positive.");
    if (weightByDate.has(weight.date))
      throw new CalculationError("date", "duplicate weight dates are not canonical.");
    weightByDate.set(weight.date, weight.weightKg);
  }
  const days = Array.from({ length: range.dayCount }, (_, offset) => {
    const date = addCalendarDays(range.startDate, offset);
    return summarizeCalendarDay({
      date,
      currentDate,
      startDate,
      durationDays,
      ...(questByDate.get(date) ? { quest: questByDate.get(date)! } : {}),
      workoutSessionCount: workoutCountByDate.get(date) ?? 0,
      ...(weightByDate.has(date) ? { weightKg: weightByDate.get(date)! } : {}),
    });
  });
  return { ...range, currentDate, days } as const;
}
