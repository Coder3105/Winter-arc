import { describe, expect, it } from "vitest";

import { EnvironmentConfigurationError, parseServerEnvironment } from "@/lib/env/schema";

describe("server environment validation", () => {
  it("accepts a MongoDB URI and database name", () => {
    const environment = parseServerEnvironment({
      MONGODB_URI: "mongodb://example.invalid:27017",
      MONGODB_DB_NAME: "winter_arc",
    });

    expect(environment.MONGODB_DB_NAME).toBe("winter_arc");
  });

  it("rejects a missing MongoDB URI without echoing a secret", () => {
    expect(() => parseServerEnvironment({ MONGODB_DB_NAME: "winter_arc" })).toThrow(
      EnvironmentConfigurationError,
    );
  });

  it("rejects unsupported connection protocols", () => {
    expect(() =>
      parseServerEnvironment({
        MONGODB_URI: "https://example.invalid/database",
        MONGODB_DB_NAME: "winter_arc",
      }),
    ).toThrow("valid MongoDB connection string");
  });

  it("rejects unsafe database names", () => {
    expect(() =>
      parseServerEnvironment({
        MONGODB_URI: "mongodb://example.invalid:27017",
        MONGODB_DB_NAME: "winter arc",
      }),
    ).toThrow("letters, numbers, underscores, and hyphens");
  });

  it("accepts an omitted scheduler secret and validates one when configured", () => {
    expect(
      parseServerEnvironment({
        MONGODB_URI: "mongodb://example.invalid:27017",
        MONGODB_DB_NAME: "winter_arc",
        CRON_SECRET: "",
      }).CRON_SECRET,
    ).toBeUndefined();
    expect(() =>
      parseServerEnvironment({
        MONGODB_URI: "mongodb://example.invalid:27017",
        MONGODB_DB_NAME: "winter_arc",
        CRON_SECRET: "too-short",
      }),
    ).toThrow("at least 16 characters");
  });
});
