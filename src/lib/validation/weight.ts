import { z } from "zod";

import { parseCalendarDate } from "@/lib/utils/calendar-date";

export const weightInputSchema = z.object({
  weightKg: z.number().finite().min(20).max(500),
});

const calendarDateSchema = z.string().refine(
  (value) => {
    try {
      parseCalendarDate(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Date must use valid YYYY-MM-DD format." },
);

export const weightHistoryRangeSchema = z
  .object({ from: calendarDateSchema, to: calendarDateSchema })
  .refine(({ from, to }) => from <= to, {
    message: "The start date must not follow the end date.",
  });

export const WEIGHT_GRAPH_RANGES = ["7D", "30D", "90D", "ALL"] as const;
export type WeightGraphRange = (typeof WEIGHT_GRAPH_RANGES)[number];

export type WeightInput = z.infer<typeof weightInputSchema>;
