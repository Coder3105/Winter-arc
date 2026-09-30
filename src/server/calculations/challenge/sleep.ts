import {
  normalizeCalendarDate,
  parseInstant,
  validateTimezone,
  type CalendarInput,
} from "../common/calendar";
import { finite, nonnegative } from "../common/validation";

/** Full dated instants are required: no guessing midnight rollover or DST ambiguity. */
export function calculateSleepDuration({
  sleepStart,
  wakeTime,
  timezone,
}: {
  sleepStart: CalendarInput;
  wakeTime: CalendarInput;
  timezone: string;
}) {
  validateTimezone(timezone);
  const start = parseInstant(sleepStart);
  const end = parseInstant(wakeTime);
  const durationMinutes = nonnegative(
    finite((end.getTime() - start.getTime()) / 60_000),
    "durationMinutes",
  );
  return {
    durationMinutes,
    durationHours: durationMinutes / 60,
    sleepDate: normalizeCalendarDate(start, timezone),
    wakeDate: normalizeCalendarDate(end, timezone),
    timezone,
  };
}
