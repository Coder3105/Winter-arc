import {
  addCalendarDays,
  normalizeCalendarDate,
  type CalendarInput,
} from "../common/calendar";
import { mean, ratioPercent } from "../common/numeric";
import { finite } from "../common/validation";
import { canonicalWeightData, type WeightDataPoint } from "./data";

export const WEEKLY_MINIMUM_SAMPLES = 4;

export function calculateRollingWeightAverage(
  points: readonly WeightDataPoint[],
  currentDate: CalendarInput,
  timezone: string,
) {
  const windowEnd = normalizeCalendarDate(currentDate, timezone);
  const windowStart = addCalendarDays(windowEnd, -6);
  const samples = canonicalWeightData(points, timezone).filter(
    ({ date }) => date >= windowStart && date <= windowEnd,
  );
  return {
    averageKg: mean(samples.map(({ weightKg }) => weightKg)),
    sampleCount: samples.length,
    windowStart,
    windowEnd,
    isSufficientData: samples.length >= WEEKLY_MINIMUM_SAMPLES,
  };
}

export function compareWeeklyWeightAverages(
  points: readonly WeightDataPoint[],
  currentDate: CalendarInput,
  timezone: string,
) {
  const current = calculateRollingWeightAverage(points, currentDate, timezone);
  const previous = calculateRollingWeightAverage(
    points,
    addCalendarDays(current.windowEnd, -7),
    timezone,
  );
  const deltaKg =
    current.averageKg === null || previous.averageKg === null
      ? null
      : finite(current.averageKg - previous.averageKg);
  return {
    currentAverageKg: current.averageKg,
    previousAverageKg: previous.averageKg,
    deltaKg,
    deltaPercent:
      deltaKg === null || previous.averageKg === null
        ? null
        : ratioPercent(deltaKg, previous.averageKg),
    currentSampleCount: current.sampleCount,
    previousSampleCount: previous.sampleCount,
    isSufficientData: current.isSufficientData && previous.isSufficientData,
  };
}
