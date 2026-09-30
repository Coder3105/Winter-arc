import mongoose from "mongoose";

import { connectToDatabase } from "@/server/db/mongoose";
import { PushSubscriptionRecordModel } from "@/server/models/push-subscription-record";

try {
  await connectToDatabase();
  await PushSubscriptionRecordModel.init();
  const indexes = await PushSubscriptionRecordModel.collection.indexes();
  const endpoint = indexes.find((index) => index.name === "unique_push_endpoint_hash");
  const owner = indexes.find((index) => index.name === "owner_push_subscriptions");
  if (!endpoint?.unique || endpoint.key.endpointHash !== 1) {
    throw new Error("unique_push_endpoint_hash verification failed.");
  }
  if (!owner || owner.key.userId !== 1 || owner.key.status !== 1) {
    throw new Error("owner_push_subscriptions verification failed.");
  }
  console.log("PUSH_SUBSCRIPTION_COLLECTION=PASS");
  console.log("PUSH_SUBSCRIPTION_INDEXES=PASS");
  console.log(
    `PUSH_SUBSCRIPTION_RECORD_COUNT=${await PushSubscriptionRecordModel.countDocuments({})}`,
  );
} finally {
  await mongoose.disconnect();
}
