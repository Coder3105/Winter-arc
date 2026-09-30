import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  status: vi.fn(),
  register: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/server/auth/api-auth", () => ({ getApiOwner: mocks.owner }));
vi.mock("@/server/services/push-subscription-service", () => ({
  getPushStatus: mocks.status,
  registerPushSubscription: mocks.register,
  unsubscribePushSubscription: mocks.unsubscribe,
}));

import { GET as getStatus } from "@/app/api/v1/push/status/route";
import { DELETE, POST } from "@/app/api/v1/push/subscriptions/route";

const owner = { id: "owner-1" };
const input = {
  endpoint: "https://push.example.test/subscription/abc",
  expirationTime: null,
  keys: { p256dh: "a".repeat(88), auth: "b".repeat(24) },
};

function request(method: "POST" | "DELETE", body: unknown, origin = "http://local") {
  return new Request("http://local/api/v1/push/subscriptions", {
    method,
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("Phase 12 push APIs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.owner.mockResolvedValue(owner);
    mocks.status.mockResolvedValue({
      configured: true,
      vapidPublicKey: "public-key",
      activeSubscriptionCount: 0,
      hasActiveSubscription: false,
    });
    mocks.register.mockResolvedValue({
      configured: true,
      vapidPublicKey: "public-key",
      activeSubscriptionCount: 1,
      hasActiveSubscription: true,
    });
    mocks.unsubscribe.mockResolvedValue({ unsubscribed: true });
  });

  it("rejects unauthenticated status and mutation access", async () => {
    mocks.owner.mockResolvedValue(null);
    expect((await getStatus()).status).toBe(401);
    expect((await POST(request("POST", input))).status).toBe(401);
  });

  it("returns only safe private/no-store status fields", async () => {
    const response = await getStatus();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const text = await response.text();
    expect(text).not.toContain("endpoint");
    expect(text).not.toContain("private-placeholder");
  });

  it("registers and unsubscribes only same-origin validated subscriptions", async () => {
    const registered = await POST(request("POST", input));
    expect(registered.status).toBe(201);
    expect(mocks.register).toHaveBeenCalledWith("owner-1", input);
    expect((await DELETE(request("DELETE", { endpoint: input.endpoint }))).status).toBe(
      200,
    );
    expect(mocks.unsubscribe).toHaveBeenCalledWith("owner-1", input.endpoint);
  });

  it("rejects missing/cross-origin requests and malformed payloads", async () => {
    expect((await POST(request("POST", input, "https://evil.test"))).status).toBe(403);
    expect(
      (
        await POST(
          new Request("http://local/api/v1/push/subscriptions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          }),
        )
      ).status,
    ).toBe(403);
    expect((await POST(request("POST", { ...input, keys: {} }))).status).toBe(400);
    expect(
      (
        await POST(
          request("POST", {
            ...input,
            padding: "x".repeat(13_000),
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.register).not.toHaveBeenCalled();
  });
});
