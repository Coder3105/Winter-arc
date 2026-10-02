import { describe, expect, it } from "vitest";

import { EnvironmentConfigurationError } from "@/lib/env/schema";
import { resolveEmailConfiguration } from "@/server/email/email-configuration";

const gmail = {
  EMAIL_PROVIDER: "gmail",
  GMAIL_USER: "mailer@example.test",
  GMAIL_APP_PASSWORD: "synthetic-app-password",
  EMAIL_FROM: "Winter Arc system@example.test",
};

describe("centralized email provider configuration", () => {
  it.each([
    { ...gmail, GMAIL_USER: undefined },
    { ...gmail, GMAIL_APP_PASSWORD: undefined },
    { ...gmail, EMAIL_FROM: undefined },
  ])("marks incomplete Gmail settings unavailable", (source) => {
    expect(resolveEmailConfiguration(source, "development")).toEqual({
      available: false,
    });
  });

  it("selects Gmail without requiring a Resend key", () => {
    expect(resolveEmailConfiguration(gmail, "production")).toEqual({
      available: true,
      provider: "gmail",
      user: "mailer@example.test",
      appPassword: "synthetic-app-password",
      from: "Winter Arc <system@example.test>",
    });
  });

  it("fails clearly for unsupported providers", () => {
    expect(() =>
      resolveEmailConfiguration({ ...gmail, EMAIL_PROVIDER: "unsupported" }),
    ).toThrow(EnvironmentConfigurationError);
    expect(() =>
      resolveEmailConfiguration({ ...gmail, EMAIL_PROVIDER: "unsupported" }),
    ).toThrow("EMAIL_PROVIDER must be either gmail or resend");
  });

  it("rejects malformed environment senders", () => {
    expect(() =>
      resolveEmailConfiguration({ ...gmail, EMAIL_FROM: "not-an-email" }),
    ).toThrow("valid sender email address");
  });

  it("keeps Resend available only through its isolated configuration", () => {
    expect(
      resolveEmailConfiguration(
        {
          EMAIL_PROVIDER: "resend",
          RESEND_API_KEY: "synthetic-key",
          EMAIL_FROM: "Winter Arc <system@mail.example.test>",
          APP_BASE_URL: "https://app.example.test/path",
        },
        "production",
      ),
    ).toEqual({
      available: true,
      provider: "resend",
      apiKey: "synthetic-key",
      from: "Winter Arc <system@mail.example.test>",
      applicationOrigin: "https://app.example.test",
    });
  });

  it("retains production safeguards for optional Resend mode", () => {
    expect(() =>
      resolveEmailConfiguration(
        {
          EMAIL_PROVIDER: "resend",
          RESEND_API_KEY: "synthetic-key",
          EMAIL_FROM: "Winter Arc <mailer@resend.dev>",
          APP_BASE_URL: "https://app.example.test",
        },
        "production",
      ),
    ).toThrow("verified custom sender domain");
  });
});
