import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: vi.fn() }));
vi.mock("@/server/services/progression-service", () => ({
  getProgressionSummary: vi.fn(),
}));

import { GET } from "@/app/api/v1/progression/route";
import { getApiOwner } from "@/server/auth/api-auth";
import { getProgressionSummary } from "@/server/services/progression-service";

describe("progression API", () => {
  beforeEach(() => vi.resetAllMocks());

  it("requires the opaque owner session", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(getProgressionSummary).not.toHaveBeenCalled();
  });

  it("is owner scoped and private/no-store", async () => {
    vi.mocked(getApiOwner).mockResolvedValue({
      id: "owner-1",
      email: "owner@example.test",
      displayName: "Owner",
    });
    vi.mocked(getProgressionSummary).mockResolvedValue({
      kind: "UNAVAILABLE",
      reason: "PROFILE_REQUIRED",
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getProgressionSummary).toHaveBeenCalledExactlyOnceWith("owner-1");
  });
});
