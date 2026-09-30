import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/validation/notification-preferences";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  list: vi.fn(),
  unread: vi.fn(),
  read: vi.fn(),
  readAll: vi.fn(),
  dismiss: vi.fn(),
  getPreferences: vi.fn(),
  savePreferences: vi.fn(),
}));

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: mocks.owner }));
vi.mock("@/server/services/notification-service", () => ({
  getNotifications: mocks.list,
  getUnreadNotificationCount: mocks.unread,
  markNotificationRead: mocks.read,
  markAllNotificationsRead: mocks.readAll,
  dismissNotification: mocks.dismiss,
  getNotificationPreferences: mocks.getPreferences,
  saveNotificationPreferences: mocks.savePreferences,
}));

import {
  GET as getPreferences,
  PUT as putPreferences,
} from "@/app/api/v1/notification-preferences/route";
import { GET as getNotifications } from "@/app/api/v1/notifications/route";
import { PATCH as dismissNotification } from "@/app/api/v1/notifications/[id]/dismiss/route";
import { PATCH as readNotification } from "@/app/api/v1/notifications/[id]/read/route";
import { POST as readAllNotifications } from "@/app/api/v1/notifications/read-all/route";
import { GET as getUnreadCount } from "@/app/api/v1/notifications/unread-count/route";

const owner = { id: "owner-1", email: "owner@example.test", displayName: "Owner" };

describe("Phase 11 notification APIs", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    () => getNotifications(new NextRequest("http://local/api/v1/notifications")),
    getUnreadCount,
    readAllNotifications,
    getPreferences,
    () =>
      readNotification(new Request("http://local"), {
        params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
      }),
    () =>
      dismissNotification(new Request("http://local"), {
        params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
      }),
  ])("rejects unauthenticated access", async (handler) => {
    mocks.owner.mockResolvedValue(null);
    expect((await handler()).status).toBe(401);
  });

  it("owner-scopes a private paginated list", async () => {
    mocks.owner.mockResolvedValue(owner);
    mocks.list.mockResolvedValue({ notifications: [], unreadCount: 0, nextCursor: null });
    const response = await getNotifications(
      new NextRequest(
        "http://local/api/v1/notifications?limit=12&cursor=507f1f77bcf86cd799439011",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith("owner-1", {
      limit: 12,
      cursor: "507f1f77bcf86cd799439011",
    });
  });

  it.each(["0", "51", "1.5", "lots"])("rejects invalid page limit %s", async (limit) => {
    mocks.owner.mockResolvedValue(owner);
    const response = await getNotifications(
      new NextRequest(`http://local/api/v1/notifications?limit=${limit}`),
    );
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("reads unread count and performs owner-scoped lifecycle updates", async () => {
    mocks.owner.mockResolvedValue(owner);
    mocks.unread.mockResolvedValue({ unreadCount: 2 });
    mocks.read.mockResolvedValue({ id: "notification-1", status: "READ" });
    mocks.readAll.mockResolvedValue({ updatedCount: 2 });
    mocks.dismiss.mockResolvedValue({ dismissed: true });

    const count = await getUnreadCount();
    expect(count.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.unread).toHaveBeenCalledWith("owner-1");
    await readNotification(new Request("http://local"), {
      params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
    });
    expect(mocks.read).toHaveBeenCalledWith("owner-1", "507f1f77bcf86cd799439011");
    await readAllNotifications();
    expect(mocks.readAll).toHaveBeenCalledWith("owner-1");
    await dismissNotification(new Request("http://local"), {
      params: Promise.resolve({ id: "507f1f77bcf86cd799439012" }),
    });
    expect(mocks.dismiss).toHaveBeenCalledWith("owner-1", "507f1f77bcf86cd799439012");
  });

  it("returns opt-in defaults and saves only validated preferences", async () => {
    mocks.owner.mockResolvedValue(owner);
    mocks.getPreferences.mockResolvedValue({
      kind: "AVAILABLE",
      preferences: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        timezone: "Asia/Kolkata",
        isPersisted: false,
      },
    });
    expect((await getPreferences()).status).toBe(200);
    expect(mocks.getPreferences).toHaveBeenCalledWith("owner-1");

    mocks.savePreferences.mockResolvedValue({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enabled: true,
      timezone: "Asia/Kolkata",
      isPersisted: true,
    });
    const input = { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true };
    const response = await putPreferences(
      new Request("http://local/api/v1/notification-preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.savePreferences).toHaveBeenCalledWith("owner-1", input);
  });

  it("rejects invalid times and duplicate/excessive hydration slots before persistence", async () => {
    mocks.owner.mockResolvedValue(owner);
    const invalid = [
      {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        steps: { enabled: true, time: "25:00" },
      },
      {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        hydration: { enabled: true, times: ["14:00", "14:00"] },
      },
      {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        hydration: {
          enabled: true,
          times: ["08:00", "10:00", "12:00", "14:00", "16:00"],
        },
      },
    ];
    for (const input of invalid) {
      const response = await putPreferences(
        new Request("http://local", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });
});
