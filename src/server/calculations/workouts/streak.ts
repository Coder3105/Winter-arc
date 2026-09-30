import type { WorkoutWeekSummary } from "./week";

export interface WorkoutWeekStreak {
  readonly current: number;
  readonly longest: number;
}

export function calculateWorkoutWeekStreak(
  weeks: readonly Pick<WorkoutWeekSummary, "isWeekFinalized" | "state">[],
): WorkoutWeekStreak {
  let current = 0;
  let longest = 0;
  for (const week of weeks) {
    if (!week.isWeekFinalized && week.state !== "SECURED") continue;
    if (week.state === "SECURED") {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return { current, longest };
}
