import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/logout-button", () => ({ LogoutButton: () => null }));

import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/validation/notification-preferences";
import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { NotificationSettings } from "@/components/notifications/notification-settings";

describe("Phase 11 notification UI", () => {
  it("adds a notification inbox bell without changing the primary destination set", () => {
    const markup = renderToStaticMarkup(
      createElement(AuthenticatedHeader, {
        displayName: "Owner",
        section: "TODAY",
        active: "TODAY",
      }),
    );
    expect(markup).toContain('href="/notifications"');
    expect(markup).toContain('aria-label="Notifications"');
    for (const route of ["/today", "/calendar", "/workouts", "/progress", "/reports"])
      expect(markup).toContain(`href="${route}"`);
  });

  it("renders the private inbox, unread state, controlled action, and lifecycle actions", () => {
    const markup = renderToStaticMarkup(
      createElement(NotificationCenter, {
        initial: {
          unreadCount: 1,
          nextCursor: null,
          notifications: [
            {
              id: "notification-1",
              type: "DAILY_QUEST",
              title: "DAILY QUEST INCOMPLETE",
              body: "Two Daily Quest items remain.",
              priority: "NORMAL",
              status: "UNREAD",
              actionRoute: "/today",
              sourceDate: "2026-10-05",
              challengeDay: 6,
              challengeWeek: 1,
              generatedAt: "2026-10-05T14:30:00.000Z",
              readAt: null,
              delivery: "IN_APP_READY",
            },
          ],
        },
      }),
    );
    expect(markup).toContain("1 UNREAD");
    expect(markup).toContain("MARK ALL READ");
    expect(markup).toContain("MARK READ");
    expect(markup).toContain("DISMISS");
    expect(markup).toContain('href="/today"');
  });

  it("renders a useful inbox empty state", () => {
    const markup = renderToStaticMarkup(
      createElement(NotificationCenter, {
        initial: { unreadCount: 0, nextCursor: null, notifications: [] },
      }),
    );
    expect(markup).toContain("NO SYSTEM NOTIFICATIONS");
  });

  it("renders opt-in categories, editable slots, quiet hours, privacy, and delivery separation", () => {
    const markup = renderToStaticMarkup(
      createElement(NotificationSettings, {
        initial: {
          kind: "AVAILABLE",
          preferences: {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            timezone: "Asia/Kolkata",
            isPersisted: false,
          },
        },
      }),
    );
    expect(markup).toContain("ENABLE APPLICATION REMINDERS");
    expect(markup).toContain("EMAIL REMINDERS");
    expect(markup).toContain("DAILY QUEST REMINDER AT 6 PM");
    expect(markup).toContain("separate from application and Web Push reminders");
    expect(markup).toContain("DAILY QUEST");
    expect(markup).toContain("MORNING WEIGHT");
    expect(markup).toContain("HYDRATION");
    expect(markup).toContain("WORKOUT");
    expect(markup).toContain("RECOVERY");
    expect(markup).toContain("WEEKLY REPORT");
    expect(markup).toContain("ACHIEVEMENT REWARD");
    expect(markup).toContain("QUIET HOURS");
    expect(markup).toContain("PRIVACY MODE");
    expect(markup).toContain("Asia/Kolkata");
    expect(markup).toContain("device is subscribed for Web Push");
    expect(markup).not.toContain("NO FAP");
  });
});
