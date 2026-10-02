import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  environment: vi.fn(),
  applicationOrigin: vi.fn(),
  connect: vi.fn(),
  ownerFind: vi.fn(),
  ownerLimit: vi.fn(),
  evaluate: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: mocks.environment,
  getConfiguredApplicationOrigin: mocks.applicationOrigin,
}));
vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/models/owner", () => ({
  OwnerModel: { find: mocks.ownerFind },
}));
vi.mock("@/server/services/notification-service", () => ({
  evaluateAllNotifications: mocks.evaluate,
}));

import { POST } from "@/app/api/internal/notifications/evaluate/route";
import { GET } from "@/app/api/internal/notifications/cron/route";
import { ACTIVE_ACCOUNT_FILTER } from "@/server/auth/account-status";
import { runNotificationScheduler } from "@/server/services/notification-scheduler-service";

const secret = "phase-11-test-secret";

describe("internal notification scheduler security", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.environment.mockReturnValue({ CRON_SECRET: secret });
    mocks.applicationOrigin.mockReturnValue(undefined);
    mocks.connect.mockResolvedValue(undefined);
    mocks.ownerFind.mockReturnValue({
      select: () => ({ sort: () => ({ limit: mocks.ownerLimit }) }),
    });
    mocks.ownerLimit.mockResolvedValue([{ _id: { toString: () => "owner-1" } }]);
    mocks.evaluate.mockResolvedValue({
      timeBased: { kind: "AVAILABLE", generated: 0 },
      eventBased: { generated: 0 },
    });
  });

  it("rejects missing and wrong bearer credentials without leaking the secret", async () => {
    const missing = await POST(new Request("http://local", { method: "POST" }));
    expect(missing.status).toBe(401);
    const wrong = await POST(
      new Request("http://local", {
        method: "POST",
        headers: { authorization: "Bearer definitely-wrong" },
      }),
    );
    expect(wrong.status).toBe(401);
    expect(`${await missing.text()}${await wrong.text()}`).not.toContain(secret);
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("reports secure server misconfiguration without revealing a supplied credential", async () => {
    mocks.environment.mockReturnValue({ CRON_SECRET: undefined });
    const response = await POST(
      new Request("http://local", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(secret);
  });

  it("accepts the correct secret, scopes each active account, and is retry-safe", async () => {
    const request = () =>
      new Request("http://local", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
    const first = await POST(request());
    const second = await POST(request());
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.ownerFind).toHaveBeenCalledWith(ACTIVE_ACCOUNT_FILTER);
    expect(mocks.evaluate).toHaveBeenCalledTimes(2);
    expect(mocks.evaluate).toHaveBeenNthCalledWith(1, "owner-1", expect.any(Date));
    expect(mocks.evaluate).toHaveBeenNthCalledWith(2, "owner-1", expect.any(Date));
  });

  it("evaluates separate users and continues after a sanitized per-user failure", async () => {
    mocks.ownerLimit.mockResolvedValue([
      { _id: { toString: () => "user-a" } },
      { _id: { toString: () => "user-b" } },
    ]);
    mocks.evaluate.mockRejectedValueOnce(new Error("private error"));
    await expect(runNotificationScheduler()).resolves.toMatchObject({
      processedUsers: 2,
      providerConfigured: false,
      push: { usersEvaluated: 1, usersFailed: 1 },
    });
    expect(mocks.evaluate).toHaveBeenNthCalledWith(1, "user-a", expect.any(Date));
    expect(mocks.evaluate).toHaveBeenNthCalledWith(2, "user-b", expect.any(Date));
  });

  it("offers the same protected scheduler through the Vercel-compatible GET adapter", async () => {
    const unauthorized = await GET(
      new Request("http://local/api/internal/notifications/cron"),
    );
    expect(unauthorized.status).toBe(401);
    const response = await GET(
      new Request("http://local/api/internal/notifications/cron", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.text();
    expect(body).not.toContain(secret);
    expect(mocks.evaluate).toHaveBeenCalledTimes(1);
  });
});
