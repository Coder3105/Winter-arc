import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: vi.fn() }));
vi.mock("@/server/services/weight-service", () => ({
  deleteTodayWeight: vi.fn(),
  getTodayWeight: vi.fn(),
  getWeightAnalytics: vi.fn(),
  getWeightHistory: vi.fn(),
  upsertTodayWeight: vi.fn(),
}));

import { GET as getHistory } from "@/app/api/v1/weights/route";
import { GET as getSummary } from "@/app/api/v1/weights/summary/route";
import {
  DELETE as deleteToday,
  GET as getToday,
  PUT as putToday,
} from "@/app/api/v1/weights/today/route";
import { getApiOwner } from "@/server/auth/api-auth";
import {
  deleteTodayWeight,
  getTodayWeight,
  getWeightAnalytics,
  getWeightHistory,
  upsertTodayWeight,
} from "@/server/services/weight-service";

const owner = { id: "owner-1", email: "owner@example.test", displayName: "Owner" };

describe("weight APIs", () => {
  beforeEach(() => vi.resetAllMocks());

  it("protects today, history and summary operations", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(null);
    expect((await getToday()).status).toBe(401);
    expect((await deleteToday()).status).toBe(401);
    expect(
      (await putToday(new Request("http://test", { method: "PUT", body: "{}" }))).status,
    ).toBe(401);
    expect((await getSummary()).status).toBe(401);
    expect(
      (
        await getHistory(
          new NextRequest("http://test/api/v1/weights?from=2026-09-01&to=2026-09-30"),
        )
      ).status,
    ).toBe(401);
  });

  it("validates and owner-scopes PUT without accepting browser ownership", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    vi.mocked(upsertTodayWeight).mockResolvedValue({
      weight: { id: "weight-1" },
      quest: { id: "quest-1" },
    } as never);
    const response = await putToday(
      new Request("http://test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weightKg: 108.55, userId: "attacker" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(upsertTodayWeight).toHaveBeenCalledExactlyOnceWith("owner-1", {
      weightKg: 108.55,
    });
  });

  it.each([0, -1, 19.9, 500.1, null])(
    "rejects invalid PUT weight %s",
    async (weightKg) => {
      vi.mocked(getApiOwner).mockResolvedValue(owner);
      const response = await putToday(
        new Request("http://test", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ weightKg }),
        }),
      );
      expect(response.status).toBe(400);
      expect(upsertTodayWeight).not.toHaveBeenCalled();
    },
  );

  it("returns private today, delete and summary responses", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    vi.mocked(getTodayWeight).mockResolvedValue({
      kind: "AVAILABLE",
      localDate: "2026-09-30",
      weight: null,
    });
    vi.mocked(deleteTodayWeight).mockResolvedValue({ deleted: {}, quest: {} } as never);
    vi.mocked(getWeightAnalytics).mockResolvedValue({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
    });
    const responses = await Promise.all([getToday(), deleteToday(), getSummary()]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(
      responses.every(
        (response) => response.headers.get("cache-control") === "private, no-store",
      ),
    ).toBe(true);
  });

  it("validates, bounds through the service, and owner-scopes history", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    expect(
      (
        await getHistory(
          new NextRequest("http://test/api/v1/weights?from=bad&to=2026-09-30"),
        )
      ).status,
    ).toBe(400);
    vi.mocked(getWeightHistory).mockResolvedValue({
      kind: "AVAILABLE",
      weights: [],
    } as never);
    const response = await getHistory(
      new NextRequest(
        "http://test/api/v1/weights?from=2026-09-01&to=2026-09-30&userId=attacker",
      ),
    );
    expect(response.status).toBe(200);
    expect(getWeightHistory).toHaveBeenCalledExactlyOnceWith(
      "owner-1",
      "2026-09-01",
      "2026-09-30",
    );
  });
});
