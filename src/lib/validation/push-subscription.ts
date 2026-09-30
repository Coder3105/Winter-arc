import { z } from "zod";

const endpoint = z
  .string()
  .trim()
  .min(12)
  .max(2048)
  .url()
  .refine((value) => value.startsWith("https://"), "A secure endpoint is required.");

const key = z
  .string()
  .trim()
  .min(16)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+={0,2}$/);

export const pushSubscriptionInputSchema = z
  .object({
    endpoint,
    expirationTime: z.number().safe().int().nonnegative().nullable(),
    keys: z.object({ p256dh: key, auth: key }).strict(),
  })
  .strict();

export const pushUnsubscribeInputSchema = z.object({ endpoint }).strict();

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;
