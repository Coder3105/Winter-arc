import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/api-auth", () => ({
  getApiOwner: vi.fn().mockResolvedValue(null),
}));

import { GET as getProfile } from "@/app/api/v1/profile/route";

describe("protected APIs", () => {
  it("rejects unauthenticated profile access", async () => {
    const response = await getProfile();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
      },
    });
  });
});
