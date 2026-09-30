import { z } from "zod";

import { WORKOUT_TYPES } from "@/server/models/workout-record";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || null);

export const workoutInputSchema = z.object({
  type: z.enum(WORKOUT_TYPES),
  title: optionalText(100),
  durationMinutes: z.number().finite().int().min(1).max(1_440),
  notes: optionalText(2_000),
});

export const workoutIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export type WorkoutInput = z.infer<typeof workoutInputSchema>;
