import { normalizeCalendarDate, type CalendarInput } from "../common/calendar";
import { CalculationError, positive } from "../common/validation";

export interface WeightDataPoint {
  readonly date: CalendarInput;
  readonly weightKg: number;
}

export function canonicalWeightData(
  points: readonly WeightDataPoint[],
  timezone: string,
) {
  // Validate even empty input so no implicit server timezone can enter the contract.
  normalizeCalendarDate("2000-01-01", timezone);
  const seen = new Set<string>();
  return points
    .map((point) => {
      const date = normalizeCalendarDate(point.date, timezone);
      if (seen.has(date))
        throw new CalculationError(
          "date",
          "duplicate calendar dates require caller canonicalization.",
        );
      seen.add(date);
      return { date, weightKg: positive(point.weightKg, "weightKg") };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
