import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  configuration: vi.fn(),
  init: vi.fn(),
  count: vi.fn(),
  upsert: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/server/db/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/server/push/vapid-configuration", () => ({
  getWebPushConfiguration: mocks.configuration,
}));
vi.mock("@/server/models/push-subscription-record", () => ({
  PushSubscriptionRecordModel: {
    init: mocks.init,
    countDocuments: mocks.count,
    findOneAndUpdate: mocks.upsert,
    updateOne: mocks.updateOne,
  },
}));

import {
  getPushStatus,
  registerPushSubscription,
  unsubscribePushSubscription,
} from "@/server/services/push-subscription-service";

const input = {
  endpoint: "https://push.example.test/subscription/device-one",
  expirationTime: null,
  keys: { p256dh: "a".repeat(88), auth: "b".repeat(24) },
};

describe("push subscription service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.init.mockResolvedValue(undefined);
    mocks.count.mockResolvedValue(0);
    mocks.upsert.mockResolvedValue({ _id: "subscription-1" });
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.configuration.mockReturnValue({
      publicKey: "public-key",
      privateKey: "private-key",
      subject: "mailto:owner@example.test",
    });
  });

  it("returns only public configuration and owner-scoped counts", async () => {
    mocks.count.mockResolvedValue(2);
    await expect(getPushStatus("owner-1")).resolves.toEqual({
      configured: true,
      vapidPublicKey: "public-key",
      activeSubscriptionCount: 2,
      hasActiveSubscription: true,
    });
    expect(mocks.count).toHaveBeenCalledExactlyOnceWith({
      userId: "owner-1",
      status: "ACTIVE",
    });
  });

  it("idempotently upserts a hashed endpoint without returning it", async () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    const result = await registerPushSubscription("owner-1", input, now);
    const endpointHash = createHash("sha256").update(input.endpoint).digest("hex");
    expect(mocks.upsert).toHaveBeenCalledWith(
      { userId: "owner-1", endpointHash },
      expect.objectContaining({
        $set: expect.objectContaining({ endpoint: input.endpoint, status: "ACTIVE" }),
        $setOnInsert: expect.objectContaining({ userId: "owner-1", endpointHash }),
      }),
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    expect(JSON.stringify(result)).not.toContain(input.endpoint);
  });

  it("refuses registration when VAPID is unavailable", async () => {
    mocks.configuration.mockReturnValue(null);
    await expect(registerPushSubscription("owner-1", input)).rejects.toMatchObject({
      code: "PUSH_NOT_AVAILABLE",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("converges a concurrent duplicate-key registration on the winning device", async () => {
    mocks.upsert
      .mockRejectedValueOnce({ code: 11000 })
      .mockResolvedValueOnce({ _id: "subscription-winner" });
    await expect(registerPushSubscription("owner-1", input)).resolves.toMatchObject({
      configured: true,
    });
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[1]?.[2]).toEqual({
      returnDocument: "after",
      runValidators: true,
    });
  });

  it("never transfers A's endpoint to B on a globally unique collision", async () => {
    mocks.upsert.mockRejectedValueOnce({ code: 11000 }).mockResolvedValueOnce(null);
    await expect(registerPushSubscription("user-b", input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    for (const call of mocks.upsert.mock.calls)
      expect(call[0]).toMatchObject({ userId: "user-b" });
  });

  it("B cannot unsubscribe A's endpoint", async () => {
    mocks.updateOne.mockImplementation((filter) =>
      Promise.resolve({ modifiedCount: filter.userId === "user-a" ? 1 : 0 }),
    );
    await expect(unsubscribePushSubscription("user-b", input.endpoint)).resolves.toEqual({
      unsubscribed: false,
    });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-b" }),
      expect.anything(),
    );
  });

  it("invalidates only the authenticated owner's hashed endpoint", async () => {
    await expect(unsubscribePushSubscription("owner-1", input.endpoint)).resolves.toEqual(
      {
        unsubscribed: true,
      },
    );
    expect(mocks.updateOne).toHaveBeenCalledWith(
      {
        userId: "owner-1",
        endpointHash: createHash("sha256").update(input.endpoint).digest("hex"),
        status: "ACTIVE",
      },
      { $set: { status: "INVALID" } },
    );
  });
});
