export const PROGRESSION_RULE_VERSION = 1;

export const DAILY_RULE_XP_V1 = {
  morning_weight: 5,
  sleep: 15,
  hydration: 10,
  no_junk_food: 20,
  no_fap: 20,
  steps: 10,
  nutrition: 15,
} as const satisfies Readonly<Record<string, number>>;

export const PERFECT_DAY_XP = 25;
export const WORKOUT_DAY_XP = 30;
export const WEEKLY_WORKOUT_XP = 100;

export function getDailyRuleXp(ruleKey: string): number {
  return Object.prototype.hasOwnProperty.call(DAILY_RULE_XP_V1, ruleKey)
    ? DAILY_RULE_XP_V1[ruleKey as keyof typeof DAILY_RULE_XP_V1]
    : 0;
}

export function calculateDailyQuestPotentialXp(ruleKeys: readonly string[]): number {
  if (ruleKeys.length === 0) return 0;
  return ruleKeys.reduce((total, key) => total + getDailyRuleXp(key), 0) + PERFECT_DAY_XP;
}
