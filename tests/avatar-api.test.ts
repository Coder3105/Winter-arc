import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApiOwner: vi.fn(),
  updateProfileAvatar: vi.fn(),
}));

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: mocks.getApiOwner }));
vi.mock("@/server/services/avatar-service", () => ({
  updateProfileAvatar: mocks.updateProfileAvatar,
}));

import { PUT } from "@/app/api/v1/profile/avatar/route";

function request(body: unknown, origin = "http://local") {
  return new Request("http://local/api/v1/profile/avatar", {
    method: "PUT",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("V2.5 avatar API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getApiOwner.mockResolvedValue({
      id: "owner-a",
      email: "a@example.test",
      displayName: "A",
    });
    mocks.updateProfileAvatar.mockResolvedValue({ avatarKey: "VOID_COMMANDER" });
  });

  it("requires authentication and same-origin mutation", async () => {
    mocks.getApiOwner.mockResolvedValueOnce(null);
    expect((await PUT(request({ avatarKey: "VOID_COMMANDER" }))).status).toBe(401);
    expect(
      (await PUT(request({ avatarKey: "VOID_COMMANDER" }, "https://evil.test"))).status,
    ).toBe(403);
    expect(mocks.updateProfileAvatar).not.toHaveBeenCalled();
  });

  it("uses session ownership and returns a private no-store response", async () => {
    const response = await PUT(request({ avatarKey: "VOID_COMMANDER" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.updateProfileAvatar).toHaveBeenCalledExactlyOnceWith("owner-a", {
      avatarKey: "VOID_COMMANDER",
    });
  });

  it.each([
    { avatarKey: "UNKNOWN" },
    { avatarKey: "https://evil.test/a.webp" },
    { avatarKey: "../a.webp" },
    { avatarKey: "VOID_COMMANDER", userId: "owner-b" },
  ])("rejects uncontrolled or ownership-bearing input %#", async (body) => {
    const response = await PUT(request(body));
    expect(response.status).toBe(400);
    expect(mocks.updateProfileAvatar).not.toHaveBeenCalled();
  });

  it("accepts an explicit null reset", async () => {
    mocks.updateProfileAvatar.mockResolvedValue({ avatarKey: null });
    const response = await PUT(request({ avatarKey: null }));
    expect(response.status).toBe(200);
    expect(mocks.updateProfileAvatar).toHaveBeenCalledWith("owner-a", {
      avatarKey: null,
    });
  });
});
