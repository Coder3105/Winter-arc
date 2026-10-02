import { z } from "zod";

import { normalizeEmail } from "@/lib/auth/email";

export const guildObjectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const otpSchema = z.string().regex(/^\d{6}$/);

export const guildInviteSchema = z
  .object({
    email: z.string().trim().email().max(320).transform(normalizeEmail),
  })
  .strict();

export const guildAcceptSchema = z
  .object({ requestId: requestIdSchema, otp: otpSchema })
  .strict();

export const guildSharingSchema = z
  .object({
    shareProfileSummary: z.boolean(),
    shareCalendar: z.boolean(),
    shareWeeklyReports: z.boolean(),
    shareProgression: z.boolean(),
    shareWorkoutSummary: z.boolean(),
    shareWeight: z.boolean(),
    shareBodyComposition: z.boolean(),
    sharePrivateHabits: z.boolean(),
  })
  .strict();

export type GuildSharingInput = z.infer<typeof guildSharingSchema>;
