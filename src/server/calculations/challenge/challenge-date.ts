import {
  calendarDayIndex,
  normalizeCalendarDate,
  type CalendarInput,
} from "../common/calendar";
import { ratioPercent } from "../common/numeric";
import { CalculationError, integer } from "../common/validation";

export function calculateChallengeDay({
  startDate,
  currentDate,
  timezone,
  durationDays = 90,
}: {
  startDate: CalendarInput;
  currentDate: CalendarInput;
  timezone: string;
  durationDays?: number;
}) {
  integer(durationDays, "durationDays", 1);
  const offset =
    calendarDayIndex(normalizeCalendarDate(currentDate, timezone)) -
    calendarDayIndex(normalizeCalendarDate(startDate, timezone));
  const daysElapsed = Math.min(durationDays, Math.max(0, offset));
  const status: "NOT_STARTED" | "ACTIVE" | "COMPLETED" =
    offset < 0 ? "NOT_STARTED" : offset >= durationDays ? "COMPLETED" : "ACTIVE";
  return {
    dayNumber: status === "NOT_STARTED" ? 0 : Math.min(durationDays, offset + 1),
    daysElapsed,
    daysRemaining: durationDays - daysElapsed,
    progressPercent: ratioPercent(daysElapsed, durationDays),
    status,
  };
}

export function challengeDayToWeek(dayOfChallenge: number, durationDays = 90) {
  integer(durationDays, "durationDays", 1);
  integer(dayOfChallenge, "dayOfChallenge", 1);
  if (dayOfChallenge > durationDays)
    throw new CalculationError("dayOfChallenge", "must be within the challenge.");
  const weekNumber = Math.ceil(dayOfChallenge / 7);
  return {
    weekNumber,
    dayOfChallenge,
    dayInChallengeWeek: ((dayOfChallenge - 1) % 7) + 1,
    weekStartChallengeDay: (weekNumber - 1) * 7 + 1,
    weekEndChallengeDay: Math.min(weekNumber * 7, durationDays),
  };
}
