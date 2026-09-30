import "server-only";

import { connectToDatabase } from "@/server/db/mongoose";
import { OwnerModel } from "@/server/models/owner";
import { evaluateAllNotifications } from "@/server/services/notification-service";

export async function runNotificationScheduler(now = new Date()) {
  await connectToDatabase();
  const owner = await OwnerModel.findOne({ isActive: true }).sort({ createdAt: 1 });
  if (!owner) return { ownerFound: false, result: null } as const;
  return {
    ownerFound: true,
    result: await evaluateAllNotifications(owner._id.toString(), now),
  } as const;
}
