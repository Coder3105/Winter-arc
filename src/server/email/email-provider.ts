import "server-only";

import { getServerEnvironment } from "@/lib/env/server";
import { AppError } from "@/server/errors/app-error";

import { resolveEmailConfiguration } from "./email-configuration";
import { GmailEmailProvider } from "./gmail-email-provider";
import { ResendEmailProvider } from "./resend-email-provider";

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export function getOtpPepper(): string {
  const pepper = getServerEnvironment().OTP_PEPPER;
  if (!pepper) throw new AppError("OTP_NOT_CONFIGURED");
  return pepper;
}

export function createEmailProvider(): EmailProvider {
  const configuration = resolveEmailConfiguration(getServerEnvironment());
  if (!configuration.available) throw new AppError("EMAIL_NOT_CONFIGURED");

  if (configuration.provider === "gmail") {
    return new GmailEmailProvider(
      configuration.user,
      configuration.appPassword,
      configuration.from,
    );
  }

  return new ResendEmailProvider(configuration.apiKey, configuration.from);
}
