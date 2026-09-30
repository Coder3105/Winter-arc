import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: vi.fn() }));
vi.mock("@/server/services/calculation-summary-service", () => ({
  getCalculationSummary: vi.fn(),
}));

import { GET } from "@/app/api/v1/calculations/summary/route";
import { getApiOwner } from "@/server/auth/api-auth";
import { getCalculationSummary } from "@/server/services/calculation-summary-service";
import { AppError } from "@/server/errors/app-error";

describe("protected calculation summary API", () => {
  beforeEach(() => vi.resetAllMocks());
  it("rejects unauthenticated access before accessing data", async () => {
    vi.mocked(getApiOwner).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(getCalculationSummary).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
  });
  it("scopes the service to the authenticated owner and prevents caching", async () => {
    vi.mocked(getApiOwner).mockResolvedValue({
      id: "session-owner",
      displayName: "Owner",
      email: "owner@example.test",
    });
    vi.mocked(getCalculationSummary).mockResolvedValue({
      source: null,
      calculated: null,
    } as Awaited<ReturnType<typeof getCalculationSummary>>);
    const response = await GET();
    expect(getCalculationSummary).toHaveBeenCalledExactlyOnceWith("session-owner");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      success: true,
      data: { source: null, calculated: null },
    });
  });
  it("preserves the application's sanitized database-error envelope", async () => {
    vi.mocked(getApiOwner).mockResolvedValue({
      id: "session-owner",
      displayName: "Owner",
      email: "owner@example.test",
    });
    vi.mocked(getCalculationSummary).mockRejectedValue(
      new AppError("DATABASE_UNAVAILABLE"),
    );
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "DATABASE_UNAVAILABLE" },
    });
  });
});
