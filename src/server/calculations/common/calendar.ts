import { formatCalendarDate, parseCalendarDate } from "@/lib/utils/calendar-date";
import { CalculationError, integer } from "./validation";

export type CalendarInput = string | Date;
const DAY_MS = 86_400_000;
const INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function validateTimezone(timezone: string): void {
  try {
    if (!timezone) throw new Error();
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
  } catch {
    throw new CalculationError("timezone", "must be a supported explicit timezone.");
  }
}

export function calendarDayIndex(date: string): number {
  try {
    // UTC is only a numeric representation of calendar fields, never local elapsed time.
    return parseCalendarDate(date).getTime() / DAY_MS;
  } catch {
    throw new CalculationError("date", "must be a valid YYYY-MM-DD calendar date.");
  }
}

export function parseInstant(input: CalendarInput): Date {
  if (input instanceof Date) {
    if (Number.isFinite(input.getTime())) return new Date(input.getTime());
  } else if (typeof input === "string" && INSTANT_PATTERN.test(input)) {
    calendarDayIndex(input.slice(0, 10));
    const hours = Number(input.slice(11, 13));
    const minutes = Number(input.slice(14, 16));
    const seconds = Number(input.slice(17, 19));
    const parsed = new Date(input);
    if (hours < 24 && minutes < 60 && seconds < 60 && Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }
  throw new CalculationError(
    "instant",
    "requires a valid Date or ISO timestamp with Z/offset.",
  );
}

/** Date-only inputs are literal local calendar labels; instants are converted to timezone. */
export function normalizeCalendarDate(input: CalendarInput, timezone: string): string {
  validateTimezone(timezone);
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    calendarDayIndex(input);
    return input;
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    calendar: "gregory",
    numberingSystem: "latn",
    era: "short",
  });
  const parts = formatter.formatToParts(parseInstant(input));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  // ICU versions may label the positive ISO era AD or CE. Compare against a
  // known positive year using the same formatter, not a hardcoded English label.
  const positiveEra = formatter
    .formatToParts(new Date("2000-01-01T12:00:00Z"))
    .find((item) => item.type === "era")?.value;
  if (!positiveEra || part("era") !== positiveEra)
    throw new CalculationError("date", "year must be in 0001–9999.");
  const date = `${part("year")?.padStart(4, "0")}-${part("month")}-${part("day")}`;
  calendarDayIndex(date);
  return date;
}

export function addCalendarDays(date: string, days: number): string {
  integer(Math.abs(days), "days");
  const result = new Date((calendarDayIndex(date) + days) * DAY_MS);
  if (!Number.isFinite(result.getTime()))
    throw new CalculationError("date", "out of range.");
  const formatted = formatCalendarDate(result);
  calendarDayIndex(formatted);
  return formatted;
}
