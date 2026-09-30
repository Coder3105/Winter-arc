const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseCalendarDate(value: string): Date {
  if (!CALENDAR_DATE_PATTERN.test(value)) {
    throw new Error("Calendar date must use YYYY-MM-DD format.");
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    year < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Calendar date is invalid.");
  }

  return date;
}

export function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function calculateProtocolEndDate(startDate: Date, durationDays: number): Date {
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + durationDays - 1);
  return endDate;
}
