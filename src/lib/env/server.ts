import "server-only";

import {
  parseApplicationOrigin,
  parseServerEnvironment,
  type ServerEnvironment,
} from "./schema";

let cachedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  cachedEnvironment ??= parseServerEnvironment({
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
    CRON_SECRET: process.env.CRON_SECRET,
    WEB_PUSH_VAPID_PUBLIC_KEY: process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
    WEB_PUSH_VAPID_PRIVATE_KEY: process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
    WEB_PUSH_SUBJECT: process.env.WEB_PUSH_SUBJECT,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    GMAIL_USER: process.env.GMAIL_USER,
    GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    OTP_PEPPER: process.env.OTP_PEPPER,
    APP_BASE_URL: process.env.APP_BASE_URL,
  });

  return cachedEnvironment;
}

export function getConfiguredApplicationOrigin(): string | undefined {
  return parseApplicationOrigin(process.env.APP_BASE_URL);
}
