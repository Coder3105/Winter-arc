import { describe, expect, it } from "vitest";

import { NotificationPreferencesModel } from "@/server/models/notification-preferences";
import { NotificationRecordModel } from "@/server/models/notification-record";

describe("Phase 11 persistence contracts", () => {
  it("keeps one preference document per owner", () => {
    expect(
      NotificationPreferencesModel.schema
        .indexes()
        .some(
          ([fields, options]) =>
            fields.userId === 1 &&
            options.unique === true &&
            options.name === "unique_notification_preferences",
        ),
    ).toBe(true);
  });

  it("enforces one versioned notification per deterministic logical identity", () => {
    expect(
      NotificationRecordModel.schema
        .indexes()
        .some(
          ([fields, options]) =>
            fields.userId === 1 &&
            fields.winterArcConfigId === 1 &&
            fields.dedupeKey === 1 &&
            fields.policyVersion === 1 &&
            options.unique === true &&
            options.name === "unique_notification_dedupe",
        ),
    ).toBe(true);
  });

  it("separates notification status from delivery state and stores safe/private text", () => {
    for (const path of [
      "status",
      "delivery",
      "title",
      "body",
      "privateTitle",
      "privateBody",
      "readAt",
      "dismissedAt",
    ])
      expect(NotificationRecordModel.schema.path(path)).toBeDefined();
    expect(NotificationRecordModel.schema.path("pushSubscription")).toBeUndefined();
  });
});
