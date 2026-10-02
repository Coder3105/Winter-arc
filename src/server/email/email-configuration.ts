import "server-only";

import { EnvironmentConfigurationError, parseApplicationOrigin } from "@/lib/env/schema";

interface EmailConfigurationSource {
  readonly EMAIL_PROVIDER?: string | undefined;
  readonly GMAIL_USER?: string | undefined;
  readonly GMAIL_APP_PASSWORD?: string | undefined;
  readonly RESEND_API_KEY?: string | undefined;
  readonly EMAIL_FROM?: string | undefined;
  readonly APP_BASE_URL?: string | undefined;
}

export type EmailConfiguration =
  | { readonly available: false }
  | {
      readonly available: true;
      readonly provider: "gmail";
      readonly user: string;
      readonly appPassword: string;
      readonly from: string;
    }
  | {
      readonly available: true;
      readonly provider: "resend";
      readonly apiKey: string;
      readonly from: string;
      readonly applicationOrigin: string;
    };

function optional(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseSender(value: string) {
  const angle = value.match(/^(.*?)<([^<>]+)>$/);
  const parts = value.split(/\s+/);
  const address = (angle?.[2] ?? parts.at(-1) ?? "").trim().toLowerCase();
  const displayName = (angle?.[1] ?? parts.slice(0, -1).join(" ")).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new EnvironmentConfigurationError([
      "EMAIL_FROM must contain a valid sender email address.",
    ]);
  }
  return {
    domain: address.slice(address.lastIndexOf("@") + 1),
    formatted: displayName ? `${displayName} <${address}>` : address,
  };
}

function parseOrigin(value: string | undefined) {
  try {
    return parseApplicationOrigin(value);
  } catch {
    throw new EnvironmentConfigurationError([
      "APP_BASE_URL must be a valid absolute HTTP(S) URL.",
    ]);
  }
}

export function resolveEmailConfiguration(
  source: EmailConfigurationSource,
  runtime = process.env.NODE_ENV,
): EmailConfiguration {
  const provider = optional(source.EMAIL_PROVIDER);
  if (!provider) return { available: false };
  if (provider !== "gmail" && provider !== "resend") {
    throw new EnvironmentConfigurationError([
      "EMAIL_PROVIDER must be either gmail or resend.",
    ]);
  }

  const senderValue = optional(source.EMAIL_FROM);
  if (provider === "gmail") {
    const user = optional(source.GMAIL_USER);
    const appPassword = optional(source.GMAIL_APP_PASSWORD);
    if (!user || !appPassword || !senderValue) return { available: false };

    return {
      available: true,
      provider,
      user,
      appPassword,
      from: parseSender(senderValue).formatted,
    };
  }

  const apiKey = optional(source.RESEND_API_KEY);
  const applicationOrigin = parseOrigin(optional(source.APP_BASE_URL));
  if (!apiKey || !senderValue || !applicationOrigin) return { available: false };

  const sender = parseSender(senderValue);
  const origin = new URL(applicationOrigin);
  if (runtime === "production") {
    if (origin.protocol !== "https:") {
      throw new EnvironmentConfigurationError([
        "Production APP_BASE_URL must use HTTPS.",
      ]);
    }
    if (
      origin.hostname === "localhost" ||
      origin.hostname === "127.0.0.1" ||
      origin.hostname === "[::1]"
    ) {
      throw new EnvironmentConfigurationError([
        "Production APP_BASE_URL must use the deployed application host.",
      ]);
    }
    if (sender.domain === "resend.dev" || sender.domain.endsWith(".resend.dev")) {
      throw new EnvironmentConfigurationError([
        "Production EMAIL_FROM must use a verified custom sender domain.",
      ]);
    }
  }

  return {
    available: true,
    provider,
    apiKey,
    from: sender.formatted,
    applicationOrigin,
  };
}
