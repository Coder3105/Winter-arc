import { z } from "zod";

import {
  DAILY_RULE_CATALOGUE,
  getDailyRuleDefinition,
} from "@/features/winter-arc/rules";
import { parseCalendarDate } from "@/lib/utils/calendar-date";

const nullablePositive = (max: number) => z.number().positive().max(max).nullable();

export const onboardingRuleSelectionSchema = z.object({
  key: z.enum(DAILY_RULE_CATALOGUE.map((rule) => rule.key)),
  target: z.number().positive().nullable(),
});

const baseOnboardingSchema = z.object({
  displayName: z.string().trim().max(40),
  heightCm: nullablePositive(300),
  currentWeightKg: nullablePositive(1_000),
  targetWeightKg: nullablePositive(1_000),
  ageAtBaseline: z.number().int().min(0).max(150).nullable(),
  sex: z.enum(["male", "female", "other", "prefer_not_to_say"]).nullable(),
  timezone: z.string().trim().max(100).nullable(),
  startDate: z.string().nullable(),
  weeklyWorkoutTarget: z.number().int().min(1).max(7).nullable(),
  rules: z.array(onboardingRuleSelectionSchema).max(DAILY_RULE_CATALOGUE.length),
});

function addSharedIssues(
  value: z.infer<typeof baseOnboardingSchema>,
  context: z.RefinementCtx,
) {
  if (value.displayName.length > 0 && value.displayName.length < 2) {
    context.addIssue({
      code: "custom",
      path: ["displayName"],
      message: "Display name must contain at least 2 characters.",
    });
  }
  if (value.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value.timezone });
    } catch {
      context.addIssue({
        code: "custom",
        path: ["timezone"],
        message: "Select a valid IANA timezone.",
      });
    }
  }
  if (value.startDate) {
    try {
      parseCalendarDate(value.startDate);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Start date must be a valid YYYY-MM-DD calendar date.",
      });
    }
  }
  const keys = new Set<string>();
  for (const [index, selection] of value.rules.entries()) {
    if (keys.has(selection.key)) {
      context.addIssue({
        code: "custom",
        path: ["rules", index, "key"],
        message: "Each Daily Quest rule can be selected only once.",
      });
    }
    keys.add(selection.key);
    const definition = getDailyRuleDefinition(selection.key);
    if (!definition) continue;
    if (definition.target === null && selection.target !== null) {
      context.addIssue({
        code: "custom",
        path: ["rules", index, "target"],
        message: "This rule does not accept a numeric target.",
      });
    }
    if (definition.target && selection.target !== null) {
      const { min, max, step } = definition.target;
      if (selection.target < min || selection.target > max) {
        context.addIssue({
          code: "custom",
          path: ["rules", index, "target"],
          message: `${definition.name} target must be between ${min} and ${max}.`,
        });
      }
      if (step === 1 && !Number.isSafeInteger(selection.target)) {
        context.addIssue({
          code: "custom",
          path: ["rules", index, "target"],
          message: `${definition.name} target must be a whole number.`,
        });
      }
    }
  }
}

export const onboardingDraftInputSchema =
  baseOnboardingSchema.superRefine(addSharedIssues);

export const onboardingActivationInputSchema = baseOnboardingSchema.superRefine(
  (value, context) => {
    addSharedIssues(value, context);
    if (value.displayName.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["displayName"],
        message: "Display name is required.",
      });
    }
    if (!value.timezone) {
      context.addIssue({
        code: "custom",
        path: ["timezone"],
        message: "Explicitly select a timezone before activation.",
      });
    }
    if (!value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Explicitly select a start date before activation.",
      });
    }
    if (value.weeklyWorkoutTarget === null) {
      context.addIssue({
        code: "custom",
        path: ["weeklyWorkoutTarget"],
        message: "Confirm a weekly workout target before activation.",
      });
    }
    if (value.rules.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["rules"],
        message: "Select at least one Daily Quest rule.",
      });
    }
    value.rules.forEach((selection, index) => {
      const definition = getDailyRuleDefinition(selection.key);
      if (definition?.target && selection.target === null) {
        context.addIssue({
          code: "custom",
          path: ["rules", index, "target"],
          message: `Confirm the ${definition.name} target.`,
        });
      }
    });
  },
);

export type OnboardingDraftInput = z.infer<typeof onboardingDraftInputSchema>;
export type OnboardingActivationInput = z.infer<typeof onboardingActivationInputSchema>;
