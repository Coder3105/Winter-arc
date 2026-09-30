import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "@/lib/env/schema";
import {
  pushSubscriptionInputSchema,
  pushUnsubscribeInputSchema,
} from "@/lib/validation/push-subscription";
import { PushSubscriptionRecordModel } from "@/server/models/push-subscription-record";
import { parseWebPushConfiguration } from "@/server/push/vapid-configuration";

const valid = {
  endpoint: "https://push.example.test/subscription/abc",
  expirationTime: null,
  keys: { p256dh: "a".repeat(88), auth: "b".repeat(24) },
};

describe("Phase 12 subscription contract", () => {
  it("accepts a bounded secure serialized subscription", () => {
    expect(pushSubscriptionInputSchema.parse(valid)).toEqual(valid);
    expect(pushUnsubscribeInputSchema.parse({ endpoint: valid.endpoint })).toEqual({
      endpoint: valid.endpoint,
    });
  });

  it.each([
    { ...valid, endpoint: "http://push.example.test/subscription/abc" },
    { ...valid, endpoint: `https://push.test/${"x".repeat(2100)}` },
    { ...valid, keys: { p256dh: "short", auth: valid.keys.auth } },
    { ...valid, keys: { p256dh: valid.keys.p256dh } },
  ])("rejects malformed subscription input", (input) => {
    expect(pushSubscriptionInputSchema.safeParse(input).success).toBe(false);
  });

  it("stores sensitive endpoint material as non-default selections", () => {
    expect(PushSubscriptionRecordModel.schema.path("endpoint")?.options.select).toBe(
      false,
    );
    expect(PushSubscriptionRecordModel.schema.path("keys")?.options.select).toBe(false);
    expect(
      PushSubscriptionRecordModel.schema
        .indexes()
        .some(
          ([fields, options]) =>
            fields.endpointHash === 1 &&
            options.unique === true &&
            options.name === "unique_push_endpoint_hash",
        ),
    ).toBe(true);
  });

  it("accepts optional VAPID placeholders without exposing them as browser variables", () => {
    const environment = parseServerEnvironment({
      MONGODB_URI: "mongodb://example.invalid:27017",
      MONGODB_DB_NAME: "winter_arc",
      WEB_PUSH_VAPID_PUBLIC_KEY: "public-placeholder",
      WEB_PUSH_VAPID_PRIVATE_KEY: "private-placeholder",
      WEB_PUSH_SUBJECT: "mailto:owner@example.test",
    });
    expect(environment.WEB_PUSH_VAPID_PRIVATE_KEY).toBe("private-placeholder");
    expect(Object.keys(environment).some((key) => key.startsWith("NEXT_PUBLIC_"))).toBe(
      false,
    );
  });

  it("treats partial or invalid VAPID configuration as unavailable", () => {
    expect(
      parseWebPushConfiguration({
        WEB_PUSH_VAPID_PUBLIC_KEY: "not-a-real-key",
        WEB_PUSH_VAPID_PRIVATE_KEY: undefined,
        WEB_PUSH_SUBJECT: "javascript:unsafe",
      }),
    ).toBeNull();
    expect(
      parseWebPushConfiguration({
        WEB_PUSH_VAPID_PUBLIC_KEY: Buffer.alloc(65, 1).toString("base64url"),
        WEB_PUSH_VAPID_PRIVATE_KEY: Buffer.alloc(32, 2).toString("base64url"),
        WEB_PUSH_SUBJECT: "mailto:owner@example.test",
      }),
    ).toMatchObject({ subject: "mailto:owner@example.test" });
  });
});
