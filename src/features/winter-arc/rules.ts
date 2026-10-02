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

export interface DailyRuleCatalogueEntry {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly type: RuleType;
  readonly unit: string | null;
  readonly order: number;
  readonly private: boolean;
  readonly recommended: boolean;
  readonly target: {
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly placeholder: number;
  } | null;
}

export const DAILY_RULE_CATALOGUE = [
  {
    key: "morning_weight",
    name: "MORNING WEIGHT",
    description: "Track whether today's canonical weight record was logged.",
    category: "BODY",
    type: "LOGGING_REQUIREMENT",
    unit: null,
    order: 10,
    private: false,
    recommended: false,
    target: null,
  },
  {
    key: "sleep",
    name: "SLEEP",
    description: "Track your selected daily sleep target.",
    category: "RECOVERY",
    type: "NUMERIC_MINIMUM",
    unit: "hours",
    order: 20,
    private: false,
    recommended: true,
    target: { min: 1, max: 24, step: 0.25, placeholder: 7 },
  },
  {
    key: "hydration",
    name: "HYDRATION",
    description: "Track your selected daily hydration target.",
    category: "RECOVERY",
    type: "NUMERIC_MINIMUM",
    unit: "litres",
    order: 30,
    private: false,
    recommended: true,
    target: { min: 0.1, max: 20, step: 0.1, placeholder: 3 },
  },
  {
    key: "steps",
    name: "STEPS",
    description: "Track your selected daily step target.",
    category: "MOVEMENT",
    type: "NUMERIC_MINIMUM",
    unit: "steps",
    order: 40,
    private: false,
    recommended: true,
    target: { min: 1, max: 100_000, step: 1, placeholder: 10_000 },
  },
  {
    key: "nutrition",
    name: "NUTRITION",
    description: "Mark whether today's configured nutrition objective was completed.",
    category: "NUTRITION",
    type: "BOOLEAN",
    unit: null,
    order: 50,
    private: false,
    recommended: true,
    target: null,
  },
  {
    key: "no_junk_food",
    name: "NO JUNK FOOD",
    description: "Optional binary food-choice habit.",
    category: "NUTRITION",
    type: "BOOLEAN",
    unit: null,
    order: 60,
    private: false,
    recommended: false,
    target: null,
  },
  {
    key: "no_fap",
    name: "NO FAP",
    description: "Optional private binary habit.",
    category: "DISCIPLINE",
    type: "BOOLEAN",
    unit: null,
    order: 70,
    private: true,
    recommended: false,
    target: null,
  },
  {
    key: "reading",
    name: "READING",
    description: "Track your selected daily reading target.",
    category: "GROWTH",
    type: "NUMERIC_MINIMUM",
    unit: "minutes",
    order: 80,
    private: false,
    recommended: false,
    target: { min: 1, max: 1_440, step: 1, placeholder: 20 },
  },
  {
    key: "meditation",
    name: "MEDITATION",
    description: "Track your selected daily meditation target.",
    category: "RECOVERY",
    type: "NUMERIC_MINIMUM",
    unit: "minutes",
    order: 90,
    private: false,
    recommended: false,
    target: { min: 1, max: 1_440, step: 1, placeholder: 10 },
  },
  {
    key: "journaling",
    name: "JOURNALING",
    description: "Mark whether today's journal entry was completed.",
    category: "GROWTH",
    type: "BOOLEAN",
    unit: null,
    order: 100,
    private: false,
    recommended: false,
    target: null,
  },
  {
    key: "stretching",
    name: "STRETCHING",
    description: "Track your selected daily mobility or stretching target.",
    category: "MOVEMENT",
    type: "NUMERIC_MINIMUM",
    unit: "minutes",
    order: 110,
    private: false,
    recommended: false,
    target: { min: 1, max: 1_440, step: 1, placeholder: 10 },
  },
] as const satisfies readonly DailyRuleCatalogueEntry[];

export type DailyRuleKey = (typeof DAILY_RULE_CATALOGUE)[number]["key"];

export function getDailyRuleDefinition(key: string) {
  return DAILY_RULE_CATALOGUE.find((rule) => rule.key === key) ?? null;
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
