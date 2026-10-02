import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PushSubscription } from "web-push";

const mocks = vi.hoisted(() => ({
  configuration: vi.fn(),
  find: vi.fn(),
  select: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/server/push/vapid-configuration", () => ({
  getWebPushConfiguration: mocks.configuration,
}));
vi.mock("@/server/models/push-subscription-record", () => ({
  PushSubscriptionRecordModel: { find: mocks.find, updateOne: mocks.updateOne },
}));

import {
  WebPushNotificationTransport,
  type WebPushProvider,
} from "@/server/notifications/notification-transport";

const candidate = {
  type: "ACHIEVEMENT" as const,
  dedupeKey: "achievement:no_fap_sensitive",
  title: "SYSTEM ACHIEVEMENT",
  body: "A private achievement was unlocked.",
  privateTitle: "No Fap",
  privateBody: "Sensitive private detail",
  actionRoute: "/achievements",
  sourceType: "EVENT_BASED" as const,
  sourceKey: "no_fap",
  challengeDay: 4,
  challengeWeek: 1,
  sourceDate: null,
  priority: "NORMAL" as const,
  reminderSlot: null,
};

const subscription = (id: string) => ({
  _id: id,
  endpoint: `https://push.example.test/${id}`,
  expirationTime: null,
  keys: { p256dh: "p256dh", auth: "auth" },
});

describe("Web Push transport", () => {
  const send = vi.fn(async (subscription: PushSubscription, payload?: string) => {
    void subscription;
    void payload;
    return { statusCode: 201 };
  });
  let provider: WebPushProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configuration.mockReturnValue({
      subject: "mailto:owner@example.test",
      publicKey: "public",
      privateKey: "private",
    });
    mocks.find.mockReturnValue({ select: mocks.select });
    mocks.select.mockResolvedValue([]);
    mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    send.mockReset();
    send.mockResolvedValue({ statusCode: 201 });
    provider = {
      setVapidDetails: vi.fn(),
      sendNotification: send,
    };
  });

  it("reports unavailable when configuration or active subscriptions are absent", async () => {
    const transport = new WebPushNotificationTransport(provider);
    await expect(transport.send("owner-1", candidate)).resolves.toMatchObject({
      delivery: "PUSH_UNAVAILABLE",
      attemptedCount: 0,
    });
    expect(send).not.toHaveBeenCalled();

    mocks.configuration.mockReturnValue(null);
    await expect(transport.send("owner-1", candidate)).resolves.toMatchObject({
      delivery: "PUSH_UNAVAILABLE",
    });
  });

  it("fans out safe external content with a one-way recipient binding", async () => {
    mocks.select.mockResolvedValue([subscription("one"), subscription("two")]);
    const result = await new WebPushNotificationTransport(provider).send(
      "owner-1",
      candidate,
      new Date("2026-10-01T00:00:00.000Z"),
    );
    expect(result).toMatchObject({
      delivery: "PUSH_DELIVERED",
      attemptedCount: 2,
      successCount: 2,
    });
    expect(send).toHaveBeenCalledTimes(2);
    const payload = send.mock.calls[0]?.[1] as string;
    expect(payload).toContain(candidate.title);
    expect(payload).toContain(candidate.body);
    expect(payload).not.toContain("No Fap");
    expect(payload).not.toContain("no_fap");
    expect(payload).not.toContain(candidate.privateBody);
    expect(payload).not.toContain("owner-1");
    expect(JSON.parse(payload)).toMatchObject({
      recipientUserHash: createHash("sha256").update("owner-1").digest("hex"),
    });
    expect(payload).toContain('"path":"/achievements"');
  });

  it.each([404, 410])("invalidates terminal provider status %s", async (statusCode) => {
    mocks.select.mockResolvedValue([subscription("bad")]);
    send.mockRejectedValue({ statusCode });
    const result = await new WebPushNotificationTransport(provider).send(
      "owner-1",
      candidate,
    );
    expect(result).toMatchObject({
      delivery: "PUSH_UNAVAILABLE",
      invalidatedCount: 1,
      failureCount: 1,
    });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: "bad", userId: "owner-1" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "INVALID" }) }),
    );
  });

  it("keeps transient failures retriable and considers partial fanout delivered", async () => {
    mocks.select.mockResolvedValue([subscription("ok"), subscription("retry")]);
    send
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce({ statusCode: 503 });
    const result = await new WebPushNotificationTransport(provider).send(
      "owner-1",
      candidate,
    );
    expect(result).toMatchObject({
      delivery: "PUSH_DELIVERED",
      successCount: 1,
      failureCount: 1,
      invalidatedCount: 0,
    });
    const transientUpdate = mocks.updateOne.mock.calls.find(
      ([filter]) => filter._id === "retry",
    )?.[1];
    expect(transientUpdate.$set.status).toBeUndefined();
  });

  it("rejects an uncontrolled action route before provider delivery", async () => {
    mocks.select.mockResolvedValue([subscription("one")]);
    const result = await new WebPushNotificationTransport(provider).send("owner-1", {
      ...candidate,
      actionRoute: "https://evil.test",
    });
    expect(result.delivery).toBe("PUSH_UNAVAILABLE");
    expect(send).not.toHaveBeenCalled();
  });
});
