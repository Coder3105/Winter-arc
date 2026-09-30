import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationPreferencesInputSchema,
} from "@/lib/validation/notification-preferences";

describe("notification preference validation", () => {
  it("defaults to explicit opt-in with editable non-medical starter times", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toMatchObject({
      enabled: false,
      privacyMode: "PRIVATE",
      quietHours: { enabled: false },
      morningWeight: { time: "09:00" },
      hydration: { times: ["14:00", "18:00"] },
      dailyQuest: { time: "20:00" },
      steps: { time: "19:00" },
    });
    expect(
      notificationPreferencesInputSchema.safeParse(DEFAULT_NOTIFICATION_PREFERENCES)
        .success,
    ).toBe(true);
  });

  it.each(["9:00", "24:00", "12:60", "noon"])("rejects invalid HH:mm %s", (time) => {
    expect(
      notificationPreferencesInputSchema.safeParse({
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        morningWeight: { enabled: true, time },
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate or excessive hydration slots", () => {
    for (const times of [
      ["14:00", "14:00"],
      ["08:00", "10:00", "12:00", "14:00", "16:00"],
    ])
      expect(
        notificationPreferencesInputSchema.safeParse({
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          hydration: { enabled: true, times },
        }).success,
      ).toBe(false);
  });

  it("accepts cross-midnight quiet hours and rejects an enabled zero-length range", () => {
    expect(
      notificationPreferencesInputSchema.safeParse({
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        quietHours: {
          enabled: true,
          startLocalTime: "22:30",
          endLocalTime: "07:30",
        },
      }).success,
    ).toBe(true);
    expect(
      notificationPreferencesInputSchema.safeParse({
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        quietHours: {
          enabled: true,
          startLocalTime: "22:30",
          endLocalTime: "22:30",
        },
      }).success,
    ).toBe(false);
  });

  it("has no special external category for a sensitive habit", () => {
    const keys = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(keys).not.toContain("noFap");
    expect(keys).not.toContain("noJunkFood");
  });
});
