import { z } from "zod";
import { normalizeEmail } from "@/lib/auth/email";

export const loginSchema = z.object({
  email: z.string().trim().email().max(320).transform(normalizeEmail),
  password: z.string().min(1).max(256),
});

const emailSchema = z.string().trim().email().max(320).transform(normalizeEmail);
const otpSchema = z.string().regex(/^\d{6}$/);
const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const registrationPasswordSchema = z.string().min(12).max(256);

export const requestEmailOtpSchema = z.object({ email: emailSchema }).strict();
export const verifyRegistrationOtpSchema = z
  .object({
    email: emailSchema,
    requestId: requestIdSchema,
    otp: otpSchema,
    password: registrationPasswordSchema,
  })
  .strict();
export const verifyLoginOtpSchema = z
  .object({
    email: emailSchema,
    requestId: requestIdSchema,
    otp: otpSchema,
  })
  .strict();

export const ownerBootstrapSchema = z.object({
  OWNER_EMAIL: z.string().trim().email().max(320).transform(normalizeEmail),
  OWNER_PASSWORD: z.string().min(12).max(256),
  OWNER_DISPLAY_NAME: z.string().trim().min(1).max(80),
});
