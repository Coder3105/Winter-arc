import mongoose from "mongoose";

import { connectToDatabase } from "@/server/db/mongoose";
import { NotificationPreferencesModel } from "@/server/models/notification-preferences";
import { NotificationRecordModel } from "@/server/models/notification-record";

function sameKey(
  actual: Record<string, unknown> | undefined,
  expected: Record<string, number>,
) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

try {
  await connectToDatabase();
  await Promise.all([
    NotificationPreferencesModel.init(),
    NotificationRecordModel.init(),
  ]);

  const [preferenceIndexes, recordIndexes] = await Promise.all([
    NotificationPreferencesModel.collection.indexes(),
    NotificationRecordModel.collection.indexes(),
  ]);
  const preferencesUnique = preferenceIndexes.find(
    (index) => index.name === "unique_notification_preferences",
  );
  if (!preferencesUnique?.unique || !sameKey(preferencesUnique.key, { userId: 1 }))
    throw new Error("unique_notification_preferences verification failed.");

  const dedupe = recordIndexes.find(
    (index) => index.name === "unique_notification_dedupe",
  );
  if (
    !dedupe?.unique ||
    !sameKey(dedupe.key, {
      userId: 1,
      winterArcConfigId: 1,
      dedupeKey: 1,
      policyVersion: 1,
    })
  )
    throw new Error("unique_notification_dedupe verification failed.");
  const inbox = recordIndexes.find((index) => index.name === "notification_inbox");
  if (!sameKey(inbox?.key, { userId: 1, status: 1, createdAt: -1 }))
    throw new Error("notification_inbox verification failed.");

  console.log("NOTIFICATION_PREFERENCES_UNIQUE_INDEX=PASS");
  console.log("NOTIFICATION_DEDUPE_INDEX=PASS");
  console.log("NOTIFICATION_INBOX_INDEX=PASS");
  console.log(
    `NOTIFICATION_PREFERENCES_COUNT=${await NotificationPreferencesModel.countDocuments({})}`,
  );
  console.log(
    `NOTIFICATION_RECORD_COUNT=${await NotificationRecordModel.countDocuments({})}`,
  );
} finally {
  await mongoose.disconnect();
}
