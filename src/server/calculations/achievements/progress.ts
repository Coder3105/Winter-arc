import type { AchievementMetric } from "@/server/achievements/achievement-policy";
import { ACHIEVEMENT_DEFINITIONS } from "@/server/achievements/achievement-policy";

import { addCalendarDays, calendarDayIndex } from "../common/calendar";
import { integer } from "../common/validation";
import { getChallengeWeekBounds } from "../workouts/week";

export type AchievementMetrics = Readonly<Record<AchievementMetric, number>>;

export function longestConsecutiveCalendarRun(dates: readonly string[]): number {
  const indexes = [...new Set(dates.map((date) => calendarDayIndex(date)))].sort(
    (left, right) => left - right,
  );
  let longest = 0;
  let running = 0;
  let previous: number | null = null;
  for (const index of indexes) {
    running = previous !== null && index === previous + 1 ? running + 1 : 1;
    longest = Math.max(longest, running);
    previous = index;
  }
  return longest;
}

export function longestConsecutiveIntegerRun(values: readonly number[]): number {
  const sorted = [...new Set(values.map((value) => integer(value, "value", 1)))].sort(
    (left, right) => left - right,
  );
  let longest = 0;
  let running = 0;
  let previous: number | null = null;
  for (const value of sorted) {
    running = previous !== null && value === previous + 1 ? running + 1 : 1;
    longest = Math.max(longest, running);
    previous = value;
  }
  return longest;
}

export function buildRecoveryEpisodes(
  orderedKeys: readonly string[],
  successfulKeys: readonly string[],
) {
  const successful = new Set(successfulKeys);
  const result: { triggerKeys: string[]; clearingKey: string | null }[] = [];
  let triggers: string[] = [];
  for (const key of orderedKeys) {
    if (successful.has(key)) {
      if (triggers.length) result.push({ triggerKeys: triggers, clearingKey: key });
      triggers = [];
    } else {
      triggers.push(key);
    }
  }
  if (triggers.length) result.push({ triggerKeys: triggers, clearingKey: null });
  return result;
}

export function getFinalizedPerfectWeeks({
  challengeStartDate,
  durationDays,
  currentDate,
  perfectDates,
}: {
  readonly challengeStartDate: string;
  readonly durationDays: number;
  readonly currentDate: string;
  readonly perfectDates: readonly string[];
}): number[] {
  const perfect = new Set(perfectDates);
  const currentIndex = calendarDayIndex(currentDate);
  const weekCount = Math.ceil(integer(durationDays, "durationDays", 1) / 7);
  const result: number[] = [];
  for (let week = 1; week <= weekCount; week += 1) {
    const bounds = getChallengeWeekBounds({
      challengeStartDate,
      durationDays,
      challengeWeek: week,
    });
    if (
      bounds.weekLengthDays !== 7 ||
      calendarDayIndex(bounds.weekEndDate) >= currentIndex
    )
      continue;
    const everyDayPerfect = Array.from({ length: 7 }, (_, index) =>
      perfect.has(addCalendarDays(bounds.weekStartDate, index)),
    ).every(Boolean);
    if (everyDayPerfect) result.push(week);
  }
  return result;
}

export function evaluateAchievementProgress(metrics: AchievementMetrics) {
  return ACHIEVEMENT_DEFINITIONS.map((definition) => {
    const current = metrics[definition.metric];
    return {
      ...definition,
      current,
      target: definition.target,
      progressPercent: Math.min((current / definition.target) * 100, 100),
      qualified: current >= definition.target,
    } as const;
  });
}
