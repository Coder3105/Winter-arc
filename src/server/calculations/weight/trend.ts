import { calendarDayIndex } from "../common/calendar";
import { mean } from "../common/numeric";
import { finite } from "../common/validation";
import { canonicalWeightData, type WeightDataPoint } from "./data";

/** Retrospective OLS; intercept is estimated kg at the first sample date (x = 0). */
export function calculateWeightTrend(
  points: readonly WeightDataPoint[],
  timezone: string,
) {
  const data = canonicalWeightData(points, timezone);
  const first = data[0];
  const last = data.at(-1);
  if (data.length < 3 || !first || !last) return null;
  const origin = calendarDayIndex(first.date);
  const xs = data.map(({ date }) => calendarDayIndex(date) - origin);
  const ys = data.map(({ weightKg }) => weightKg);
  const xMean = mean(xs)!;
  const isFlat = ys.every((value) => value === first.weightKg);
  const yMean = isFlat ? first.weightKg : mean(ys)!;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  data.forEach((point, index) => {
    const dx = xs[index]! - xMean;
    const dy = point.weightKg - yMean;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  });
  finite(xx);
  finite(xy);
  finite(yy);
  const slopeKgPerDay = finite(xy / xx);
  const intercept = finite(yMean - slopeKgPerDay * xMean);
  const residual = finite(
    data.reduce(
      (sum, point, index) =>
        sum + (point.weightKg - (intercept + slopeKgPerDay * xs[index]!)) ** 2,
      0,
    ),
  );
  return {
    slopeKgPerDay,
    slopeKgPerWeek: finite(slopeKgPerDay * 7),
    intercept,
    sampleCount: data.length,
    // R² is undefined for a constant response, even though its slope is zero.
    rSquared: yy === 0 ? null : Math.min(1, Math.max(0, finite(1 - residual / yy))),
    startDate: first.date,
    endDate: last.date,
  };
}
