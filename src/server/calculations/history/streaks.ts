import type { DailyRuleState } from "../challenge/compliance";

export interface StreakDay {
  readonly temporalState: "PAST" | "TODAY" | "FUTURE";
  readonly eligible: boolean;
  readonly passed: boolean;
}

export interface StreakResult {
  readonly current: number;
  readonly longest: number;
}

export interface RuleStreakQuest {
  readonly date: string;
  readonly temporalState: StreakDay["temporalState"];
  readonly rules: readonly {
    readonly key: string;
    readonly name: string;
    readonly order: number;
    readonly state: DailyRuleState;
  }[];
}

/** Ineligible days are skipped; they neither increment nor break an eligible streak. */
export function calculateStreak(days: readonly StreakDay[]): StreakResult {
  let running = 0;
  let longest = 0;
  for (const day of days) {
    if (day.temporalState === "FUTURE") continue;
    if (day.temporalState === "TODAY" && !day.passed) continue;
    if (!day.eligible) continue;
    if (day.passed) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }
  return { current: running, longest };
}

export function calculatePerfectDayStreak(
  days: readonly {
    readonly temporalState: StreakDay["temporalState"];
    readonly isPerfectDay: boolean;
  }[],
): StreakResult {
  return calculateStreak(
    days.map((day) => ({
      temporalState: day.temporalState,
      eligible: true,
      passed: day.isPerfectDay,
    })),
  );
}

export function calculateRuleStreaks(
  quests: readonly RuleStreakQuest[],
  configuredRules: readonly {
    readonly key: string;
    readonly name: string;
    readonly order: number;
  }[],
) {
  const metadata = new Map(configuredRules.map((rule) => [rule.key, { ...rule }]));
  for (const quest of quests) {
    for (const rule of quest.rules) metadata.set(rule.key, rule);
  }
  return Object.fromEntries(
    [...metadata.values()]
      .sort((left, right) => left.order - right.order)
      .map((metadata) => {
        const days = quests.map((quest) => {
          const rule = quest.rules.find((candidate) => candidate.key === metadata.key);
          return {
            temporalState: quest.temporalState,
            eligible: Boolean(rule && rule.state !== "NOT_APPLICABLE"),
            passed: rule?.state === "PASS",
          };
        });
        return [metadata.key, { name: metadata.name, ...calculateStreak(days) }];
      }),
  );
}
