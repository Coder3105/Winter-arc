import { z } from "zod";

const mongoUriSchema = z
  .string({ error: "MONGODB_URI is required." })
  .trim()
  .min(1, "MONGODB_URI is required.")
  .refine(
    (value) => value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
    "MONGODB_URI must be a valid MongoDB connection string.",
  );

export const serverEnvironmentSchema = z.object({
  MONGODB_URI: mongoUriSchema,
  MONGODB_DB_NAME: z
    .string({ error: "MONGODB_DB_NAME is required." })
    .trim()
    .min(1, "MONGODB_DB_NAME is required.")
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "MONGODB_DB_NAME may contain only letters, numbers, underscores, and hyphens.",
    ),
  CRON_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16, "CRON_SECRET must contain at least 16 characters.").optional(),
  ),
  WEB_PUSH_VAPID_PUBLIC_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().min(1).optional(),
  ),
  WEB_PUSH_VAPID_PRIVATE_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().min(1).optional(),
  ),
  WEB_PUSH_SUBJECT: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().min(1).optional(),
  ),
  EMAIL_PROVIDER: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .enum(["gmail", "resend"], {
        error: "EMAIL_PROVIDER must be either gmail or resend.",
      })
      .optional(),
  ),
  GMAIL_USER: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().email("GMAIL_USER must be a valid email address.").optional(),
  ),
  GMAIL_APP_PASSWORD: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().min(1).optional(),
  ),
  RESEND_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().min(1).optional(),
  ),
  EMAIL_FROM: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().min(3).max(320).optional(),
  ),
  OTP_PEPPER: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32, "OTP_PEPPER must contain at least 32 characters.").optional(),
  ),
  APP_BASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .url("APP_BASE_URL must be an absolute URL.")
      .refine((value) => {
        try {
          return ["http:", "https:"].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      }, "APP_BASE_URL must use HTTP or HTTPS.")
      .transform((value) => new URL(value).origin)
      .optional(),
  ),
});

export function parseApplicationOrigin(value: string | undefined): string | undefined {
  return serverEnvironmentSchema.shape.APP_BASE_URL.parse(value);
}

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export class EnvironmentConfigurationError extends Error {
  readonly code = "ENVIRONMENT_CONFIGURATION_ERROR";

  constructor(issues: readonly string[]) {
    super(`Invalid server environment: ${issues.join(" ")}`);
    this.name = "EnvironmentConfigurationError";
  }
}

export function parseServerEnvironment(
  source: Record<string, string | undefined>,
): ServerEnvironment {
  const result = serverEnvironmentSchema.safeParse(source);

  if (!result.success) {
    throw new EnvironmentConfigurationError(
      result.error.issues.map((issue) => issue.message),
    );
  }

  return result.data;
}
