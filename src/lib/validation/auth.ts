import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(256),
});

export const ownerBootstrapSchema = z.object({
  OWNER_EMAIL: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  OWNER_PASSWORD: z.string().min(12).max(256),
  OWNER_DISPLAY_NAME: z.string().trim().min(1).max(80),
});
