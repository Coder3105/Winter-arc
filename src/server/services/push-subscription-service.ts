import "server-only";

import { createHash } from "node:crypto";

import type { PushSubscriptionInput } from "@/lib/validation/push-subscription";
import { connectToDatabase } from "@/server/db/mongoose";
import { AppError } from "@/server/errors/app-error";
import { PushSubscriptionRecordModel } from "@/server/models/push-subscription-record";
import { getWebPushConfiguration } from "@/server/push/vapid-configuration";

export function hashPushEndpoint(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

function isDuplicateKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function getPushStatus(userId: string) {
  await connectToDatabase();
  const [activeSubscriptionCount, configuration] = await Promise.all([
    PushSubscriptionRecordModel.countDocuments({ userId, status: "ACTIVE" }),
    Promise.resolve(getWebPushConfiguration()),
  ]);
  return {
    configured: Boolean(configuration),
    vapidPublicKey: configuration?.publicKey ?? null,
    activeSubscriptionCount,
    hasActiveSubscription: activeSubscriptionCount > 0,
  } as const;
}

export async function registerPushSubscription(
  userId: string,
  input: PushSubscriptionInput,
  now = new Date(),
) {
  if (!getWebPushConfiguration()) throw new AppError("PUSH_NOT_AVAILABLE");
  await connectToDatabase();
  await PushSubscriptionRecordModel.init();
  const endpointHash = hashPushEndpoint(input.endpoint);
  const filter = { userId, endpointHash };
  const update = {
    $set: {
      endpoint: input.endpoint,
      keys: input.keys,
      expirationTime: input.expirationTime,
      status: "ACTIVE" as const,
      lastSeenAt: now,
    },
    $setOnInsert: {
      userId,
      endpointHash,
      lastSuccessAt: null,
      lastFailureAt: null,
      failureCount: 0,
    },
  };
  try {
    await PushSubscriptionRecordModel.findOneAndUpdate(filter, update, {
      upsert: true,
      returnDocument: "after",
      runValidators: true,
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const winner = await PushSubscriptionRecordModel.findOneAndUpdate(
      filter,
      { $set: update.$set },
      { returnDocument: "after", runValidators: true },
    );
    if (!winner) throw new AppError("CONFLICT");
  }
  return getPushStatus(userId);
}

export async function unsubscribePushSubscription(userId: string, endpoint: string) {
  await connectToDatabase();
  const result = await PushSubscriptionRecordModel.updateOne(
    { userId, endpointHash: hashPushEndpoint(endpoint), status: "ACTIVE" },
    { $set: { status: "INVALID" } },
  );
  return { unsubscribed: result.modifiedCount > 0 } as const;
}
