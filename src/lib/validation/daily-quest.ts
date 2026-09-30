import { z } from "zod";

export const dailyQuestResponseInputSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/)
    .max(60),
  value: z.union([z.boolean(), z.number().finite().nonnegative()]),
});

export type DailyQuestResponseInput = z.infer<typeof dailyQuestResponseInputSchema>;
