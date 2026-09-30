import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: vi.fn() }));
vi.mock("@/server/services/history-service", () => ({
  getCalendarMonthHistory: vi.fn(),
  getStreakHistory: vi.fn(),
}));

import { GET as getCalendar } from "@/app/api/v1/calendar/route";
import { GET as getStreaks } from "@/app/api/v1/streaks/route";
import { getApiOwner } from "@/server/auth/api-auth";
import {
  getCalendarMonthHistory,
  getStreakHistory,
} from "@/server/services/history-service";

const owner = {
  id: "owner-1",
  email: "owner@example.test",
  displayName: "Owner",
};

describe("calendar and streak APIs", () => {
  beforeEach(() => vi.resetAllMocks());

  it("protects both endpoints", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(null);
    expect(
      (await getCalendar(new NextRequest("http://test/api/v1/calendar?month=2026-10")))
        .status,
    ).toBe(401);
    expect((await getStreaks()).status).toBe(401);
    expect(getCalendarMonthHistory).not.toHaveBeenCalled();
    expect(getStreakHistory).not.toHaveBeenCalled();
  });

  it.each([null, "2026-13", "26-10", "October", "2026-1"])(
    "rejects invalid month %s",
    async (month) => {
      vi.mocked(getApiOwner).mockResolvedValue(owner);
      const query = month === null ? "" : `?month=${month}`;
      const response = await getCalendar(
        new NextRequest(`http://test/api/v1/calendar${query}`),
      );
      expect(response.status).toBe(400);
      expect(getCalendarMonthHistory).not.toHaveBeenCalled();
    },
  );

  it("forwards only the authenticated owner and valid month", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    vi.mocked(getCalendarMonthHistory).mockResolvedValue({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
      month: "2026-10",
    });
    const response = await getCalendar(
      new NextRequest("http://test/api/v1/calendar?month=2026-10&userId=attacker"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getCalendarMonthHistory).toHaveBeenCalledExactlyOnceWith("owner-1", "2026-10");
  });

  it("returns private streak data for the authenticated owner", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    vi.mocked(getStreakHistory).mockResolvedValue({
      kind: "UNAVAILABLE",
      reason: "CONFIGURATION_REQUIRED",
    });
    const response = await getStreaks();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getStreakHistory).toHaveBeenCalledExactlyOnceWith("owner-1");
  });
});
