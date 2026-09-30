import { z } from "zod";

import { RULE_TYPES } from "@/features/winter-arc/rules";
import { parseCalendarDate } from "@/lib/utils/calendar-date";

export const dailyRuleInputSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]+$/)
      .max(60),
    name: z.string().trim().min(1).max(100),
    category: z.string().trim().min(1).max(50),
    enabled: z.boolean(),
    type: z.enum(RULE_TYPES),
    target: z.number().nonnegative().nullable(),
    unit: z.string().trim().max(30).nullable(),
    requiredFrequency: z.number().int().min(1).max(7),
    order: z.number().int().min(0).max(100),
  })
  .superRefine((rule, context) => {
    if (rule.type === "NUMERIC_MINIMUM" && (rule.target === null || rule.target <= 0)) {
      context.addIssue({
        code: "custom",
        path: ["target"],
        message: "Numeric minimum rules require a positive target.",
      });
    }
  });

export const winterArcInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).default("Winter Arc"),
    durationDays: z.number().int().positive().max(365).default(90),
    startDate: z.string().refine((value) => {
      try {
        parseCalendarDate(value);
        return true;
      } catch {
        return false;
      }
    }, "Start date must be a valid calendar date in YYYY-MM-DD format."),
    status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
    startingWeightKg: z.number().positive().max(1_000),
    targetWeightKg: z.number().positive().max(1_000).nullable(),
    weeklyWorkoutTarget: z.number().int().min(1).max(7).default(4),
    rules: z.array(dailyRuleInputSchema).min(1).max(50),
    notificationPreferences: z
      .object({
        enabled: z.boolean().default(false),
      })
      .default({ enabled: false }),
  })
  .superRefine((value, context) => {
    const uniqueKeys = new Set(value.rules.map((rule) => rule.key));
    if (uniqueKeys.size !== value.rules.length) {
      context.addIssue({
        code: "custom",
        path: ["rules"],
        message: "Rule keys must be unique.",
      });
    }
  });

export type WinterArcInput = z.infer<typeof winterArcInputSchema>;
