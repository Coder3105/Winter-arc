import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: vi.fn() }));
vi.mock("@/server/services/achievement-reward-service", () => ({
  getAchievementsSummary: vi.fn(),
  getRewardsSummary: vi.fn(),
  getRecoverySummary: vi.fn(),
  selectSystemTitle: vi.fn(),
}));

import { GET as getAchievements } from "@/app/api/v1/achievements/route";
import { PUT as putTitle } from "@/app/api/v1/profile/title/route";
import { GET as getRecovery } from "@/app/api/v1/recovery/route";
import { GET as getRewards } from "@/app/api/v1/rewards/route";
import { getApiOwner } from "@/server/auth/api-auth";
import {
  getAchievementsSummary,
  getRecoverySummary,
  getRewardsSummary,
  selectSystemTitle,
} from "@/server/services/achievement-reward-service";

const owner = { id: "owner-1", email: "owner@example.test", displayName: "Owner" };

describe("Phase 9 APIs", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([getAchievements, getRewards, getRecovery])(
    "requires an opaque owner session",
    async (handler) => {
      vi.mocked(getApiOwner).mockResolvedValue(null);
      expect((await handler()).status).toBe(401);
    },
  );

  it.each([
    [getAchievements, getAchievementsSummary],
    [getRewards, getRewardsSummary],
    [getRecovery, getRecoverySummary],
  ] as const)(
    "scopes reads to the owner and disables private caching",
    async (handler, service) => {
      vi.mocked(getApiOwner).mockResolvedValue(owner);
      vi.mocked(service).mockResolvedValue({
        kind: "UNAVAILABLE",
        reason: "PROFILE_OR_CONFIGURATION_REQUIRED",
      });
      const response = await handler();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(service).toHaveBeenCalledExactlyOnceWith("owner-1");
    },
  );

  it("validates and owner-scopes title selection", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(owner);
    vi.mocked(selectSystemTitle).mockResolvedValue({ selectedTitle: "DISCIPLINED" });
    const response = await putTitle(
      new Request("http://local/api/v1/profile/title", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "DISCIPLINED" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(selectSystemTitle).toHaveBeenCalledWith("owner-1", "DISCIPLINED");
  });
});
