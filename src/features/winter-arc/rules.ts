export const RULE_TYPES = ["BOOLEAN", "NUMERIC_MINIMUM", "LOGGING_REQUIREMENT"] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export interface DailyRuleConfiguration {
  readonly key: string;
  readonly name: string;
  readonly category: string;
  readonly enabled: boolean;
  readonly type: RuleType;
  readonly target: number | null;
  readonly unit: string | null;
  readonly requiredFrequency: number;
  readonly order: number;
}

export const DEFAULT_DAILY_RULES: readonly DailyRuleConfiguration[] = [
  {
    key: "morning_weight",
    name: "Log Morning Weight",
    category: "measurement",
    enabled: true,
    type: "LOGGING_REQUIREMENT",
    target: null,
    unit: null,
    requiredFrequency: 7,
    order: 1,
  },
  {
    key: "sleep",
    name: "Sleep 7+ Hours",
    category: "recovery",
    enabled: true,
    type: "NUMERIC_MINIMUM",
    target: 7,
    unit: "hours",
    requiredFrequency: 7,
    order: 2,
  },
  {
    key: "hydration",
    name: "Complete Water Target",
    category: "nutrition",
    enabled: true,
    type: "NUMERIC_MINIMUM",
    target: 3,
    unit: "litres",
    requiredFrequency: 7,
    order: 3,
  },
  {
    key: "no_junk_food",
    name: "No Junk Food",
    category: "nutrition",
    enabled: true,
    type: "BOOLEAN",
    target: null,
    unit: null,
    requiredFrequency: 7,
    order: 4,
  },
  {
    key: "no_fap",
    name: "No Fap",
    category: "discipline",
    enabled: true,
    type: "BOOLEAN",
    target: null,
    unit: null,
    requiredFrequency: 7,
    order: 5,
  },
  {
    key: "steps",
    name: "Complete Step Goal",
    category: "movement",
    enabled: true,
    type: "NUMERIC_MINIMUM",
    target: 10_000,
    unit: "steps",
    requiredFrequency: 7,
    order: 6,
  },
  {
    key: "nutrition",
    name: "Complete Nutrition Target",
    category: "nutrition",
    enabled: true,
    type: "BOOLEAN",
    target: null,
    unit: null,
    requiredFrequency: 7,
    order: 7,
  },
] as const;

export function createDefaultDailyRules(): DailyRuleConfiguration[] {
  return DEFAULT_DAILY_RULES.map((rule) => ({ ...rule }));
}
