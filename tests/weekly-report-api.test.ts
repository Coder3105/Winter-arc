import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: vi.fn() }));
vi.mock("@/server/services/weekly-report-service", () => ({
  getWeeklyReport: vi.fn(),
  getWeeklyReportList: vi.fn(),
}));

import { GET as getReports } from "@/app/api/v1/reports/route";
import { GET as getReportWeek } from "@/app/api/v1/reports/week/[week]/route";
import { getApiOwner } from "@/server/auth/api-auth";
import {
  getWeeklyReport,
  getWeeklyReportList,
} from "@/server/services/weekly-report-service";

const owner = { id: "owner-1", email: "owner@example.test", displayName: "Owner" };

describe("Phase 10 report APIs", () => {
  beforeEach(() => vi.resetAllMocks());

  it("requires authentication for list and detail", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(null);
    expect((await getReports()).status).toBe(401);
    expect(
      (
        await getReportWeek(new Request("http://local"), {
          params: Promise.resolve({ week: "1" }),
        })
      ).status,
    ).toBe(401);
  });

  it("owner-scopes the list and disables caching", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    vi.mocked(getWeeklyReportList).mockResolvedValue({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
    });
    const response = await getReports();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getWeeklyReportList).toHaveBeenCalledExactlyOnceWith("owner-1");
  });

  it("validates the week before calling the owner-scoped detail service", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    expect(
      (
        await getReportWeek(new Request("http://local"), {
          params: Promise.resolve({ week: "1.5" }),
        })
      ).status,
    ).toBe(400);
    expect(getWeeklyReport).not.toHaveBeenCalled();

    vi.mocked(getWeeklyReport).mockResolvedValue({
      kind: "UNAVAILABLE",
      reason: "PROTOCOL_NOT_STARTED",
    });
    const response = await getReportWeek(new Request("http://local"), {
      params: Promise.resolve({ week: "2" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getWeeklyReport).toHaveBeenCalledExactlyOnceWith("owner-1", 2);
  });
});
