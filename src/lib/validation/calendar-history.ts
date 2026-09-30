import { z } from "zod";

export const calendarMonthSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, "Month must use valid YYYY-MM format.");
