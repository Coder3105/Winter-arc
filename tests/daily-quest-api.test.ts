import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: vi.fn() }));
vi.mock("@/server/services/daily-quest-service", () => ({
  getOrCreateTodayDailyQuest: vi.fn(),
  updateTodayDailyQuestResponse: vi.fn(),
  getDailyQuestByDate: vi.fn(),
}));

import {
  GET as getToday,
  PATCH as patchToday,
} from "@/app/api/v1/daily-quest/today/route";
import { GET as getDate } from "@/app/api/v1/daily-quest/[date]/route";
import { getApiOwner } from "@/server/auth/api-auth";
import {
  getDailyQuestByDate,
  getOrCreateTodayDailyQuest,
  updateTodayDailyQuestResponse,
} from "@/server/services/daily-quest-service";

describe("Daily Quest APIs", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects unauthenticated today GET and PATCH", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(null);
    expect((await getToday()).status).toBe(401);
    expect(
      (
        await patchToday(
          new Request("http://test", {
            method: "PATCH",
            body: JSON.stringify({ key: "sleep", value: 8 }),
          }),
        )
      ).status,
    ).toBe(401);
    expect(getOrCreateTodayDailyQuest).not.toHaveBeenCalled();
    expect(updateTodayDailyQuestResponse).not.toHaveBeenCalled();
  });

  it("scopes today GET to the authenticated owner", async () => {
    vi.mocked(getApiOwner).mockResolvedValue({
      id: "owner-1",
      email: "owner@example.test",
      displayName: "Owner",
    });
    vi.mocked(getOrCreateTodayDailyQuest).mockResolvedValue({
      kind: "UNAVAILABLE",
      reason: "PROTOCOL_NOT_STARTED",
      localDate: "2026-09-29",
    });
    const response = await getToday();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getOrCreateTodayDailyQuest).toHaveBeenCalledExactlyOnceWith("owner-1");
  });

  it("validates and forwards a generic update without browser userId", async () => {
    vi.mocked(getApiOwner).mockResolvedValue({
      id: "owner-1",
      email: "owner@example.test",
      displayName: "Owner",
    });
    vi.mocked(updateTodayDailyQuestResponse).mockResolvedValue({
      id: "quest-1",
    } as never);
    const request = new Request("http://test", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "hydration", value: 2.5, userId: "attacker" }),
    });
    const response = await patchToday(request);
    expect(response.status).toBe(200);
    expect(updateTodayDailyQuestResponse).toHaveBeenCalledExactlyOnceWith("owner-1", {
      key: "hydration",
      value: 2.5,
    });
  });

  it.each([
    { key: "sleep", value: -1 },
    { key: "$where", value: true },
    { key: "sleep", value: "8" },
  ])("rejects invalid PATCH %#", async (body) => {
    vi.mocked(getApiOwner).mockResolvedValue({
      id: "owner-1",
      email: "owner@example.test",
      displayName: "Owner",
    });
    const response = await patchToday(
      new Request("http://test", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(400);
    expect(updateTodayDailyQuestResponse).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated, invalid, missing and reads existing direct dates", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(null);
    expect(
      (
        await getDate(new Request("http://test"), {
          params: Promise.resolve({ date: "2026-09-30" }),
        })
      ).status,
    ).toBe(401);
    vi.mocked(getApiOwner).mockResolvedValue({
      id: "owner-1",
      email: "owner@example.test",
      displayName: "Owner",
    });
    expect(
      (
        await getDate(new Request("http://test"), {
          params: Promise.resolve({ date: "2026-02-30" }),
        })
      ).status,
    ).toBe(400);
    vi.mocked(getDailyQuestByDate).mockResolvedValueOnce(null);
    expect(
      (
        await getDate(new Request("http://test"), {
          params: Promise.resolve({ date: "2026-09-30" }),
        })
      ).status,
    ).toBe(404);
    vi.mocked(getDailyQuestByDate).mockResolvedValueOnce({ id: "quest-1" } as never);
    const response = await getDate(new Request("http://test"), {
      params: Promise.resolve({ date: "2026-09-30" }),
    });
    expect(response.status).toBe(200);
    expect(getDailyQuestByDate).toHaveBeenLastCalledWith("owner-1", "2026-09-30");
  });
});
