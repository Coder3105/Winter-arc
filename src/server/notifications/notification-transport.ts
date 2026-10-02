import "server-only";

import { createHash } from "node:crypto";

import webPush, { type PushSubscription } from "web-push";

import { isSafeInternalPath } from "@/lib/pwa/safe-path";
import { PushSubscriptionRecordModel } from "@/server/models/push-subscription-record";
import { getWebPushConfiguration } from "@/server/push/vapid-configuration";

import type { NotificationCandidate } from "./notification-policy";

export type PushDelivery =
  "IN_APP_READY" | "PUSH_PENDING" | "PUSH_DELIVERED" | "PUSH_UNAVAILABLE" | "PUSH_FAILED";

export interface NotificationTransportResult {
  readonly delivery: PushDelivery;
  readonly attemptedCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly invalidatedCount: number;
  readonly attemptedAt: Date | null;
  readonly deliveredAt: Date | null;
}

export interface NotificationTransport {
  send(
    userId: string,
    notification: NotificationCandidate,
    now?: Date,
  ): Promise<NotificationTransportResult>;
}

export interface WebPushProvider {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(subscription: PushSubscription, payload?: string): Promise<unknown>;
}

function statusCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error))
    return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : null;
}

export class InAppNotificationTransport implements NotificationTransport {
  async send(): Promise<NotificationTransportResult> {
    return {
      delivery: "IN_APP_READY",
      attemptedCount: 0,
      successCount: 0,
      failureCount: 0,
      invalidatedCount: 0,
      attemptedAt: null,
      deliveredAt: null,
    };
  }
}

export class WebPushNotificationTransport implements NotificationTransport {
  constructor(private readonly provider: WebPushProvider = webPush) {}

  async send(userId: string, notification: NotificationCandidate, now = new Date()) {
    const configuration = getWebPushConfiguration();
    if (!configuration || !isSafeInternalPath(notification.actionRoute)) {
      return unavailable();
    }

    const subscriptions = await PushSubscriptionRecordModel.find({
      userId,
      status: "ACTIVE",
    }).select("+endpoint +keys");
    if (subscriptions.length === 0) return unavailable();

    this.provider.setVapidDetails(
      configuration.subject,
      configuration.publicKey,
      configuration.privateKey,
    );
    const payload = JSON.stringify({
      recipientUserHash: createHash("sha256").update(userId).digest("hex"),
      title: notification.title,
      body: notification.body,
      tag: `winter-arc-${createHash("sha256").update(notification.dedupeKey).digest("hex").slice(0, 24)}`,
      data: { path: notification.actionRoute },
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
    });

    let successCount = 0;
    let failureCount = 0;
    let invalidatedCount = 0;
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await this.provider.sendNotification(
            {
              endpoint: subscription.endpoint,
              expirationTime: subscription.expirationTime,
              keys: subscription.keys,
            },
            payload,
          );
          successCount += 1;
          await PushSubscriptionRecordModel.updateOne(
            { _id: subscription._id, userId },
            { $set: { lastSuccessAt: now, lastSeenAt: now, lastFailureAt: null } },
          );
        } catch (error) {
          failureCount += 1;
          const terminal = statusCode(error) === 404 || statusCode(error) === 410;
          if (terminal) invalidatedCount += 1;
          await PushSubscriptionRecordModel.updateOne(
            { _id: subscription._id, userId },
            {
              $set: {
                ...(terminal ? { status: "INVALID" as const } : {}),
                lastFailureAt: now,
              },
              $inc: { failureCount: 1 },
            },
          );
        }
      }),
    );

    return {
      delivery:
        successCount > 0
          ? ("PUSH_DELIVERED" as const)
          : invalidatedCount === subscriptions.length
            ? ("PUSH_UNAVAILABLE" as const)
            : ("PUSH_FAILED" as const),
      attemptedCount: subscriptions.length,
      successCount,
      failureCount,
      invalidatedCount,
      attemptedAt: now,
      deliveredAt: successCount > 0 ? now : null,
    };
  }
}

function unavailable(): NotificationTransportResult {
  return {
    delivery: "PUSH_UNAVAILABLE",
    attemptedCount: 0,
    successCount: 0,
    failureCount: 0,
    invalidatedCount: 0,
    attemptedAt: null,
    deliveredAt: null,
  };
}
