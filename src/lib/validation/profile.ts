import { z } from "zod";

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  dateOfBirth: z.iso.date().nullable().default(null),
  ageAtBaseline: z.number().int().min(0).max(150),
  sex: z.enum(["male", "female", "other", "prefer_not_to_say"]),
  heightCm: z.number().positive().max(300),
  preferredWeightUnit: z.enum(["kg", "lb"]),
  preferredDistanceUnit: z.enum(["km", "mi"]),
  timezone: z
    .string()
    .trim()
    .min(1, "Select your timezone.")
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Select a valid timezone."),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export const titleSelectionSchema = z.object({
  title: z.string().trim().min(1).max(50).nullable(),
});

export type TitleSelectionInput = z.infer<typeof titleSelectionSchema>;
